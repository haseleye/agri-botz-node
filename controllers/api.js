const User = require('../controllers/users');
const {S3Client, DeleteObjectCommand, PutObjectCommand} = require('@aws-sdk/client-s3');
const {Upload} = require("@aws-sdk/lib-storage");
const {Readable} = require('stream');
const {integer} = require("twilio/lib/base/deserialize");
const axios = require("axios");
const FormData = require('form-data');
const Image = require('../utils/imageProcessing');
const {isNumeric} = require('../utils/numberUtils');
const Process = require("process");

const addPerson = async (req, res) => {
    try {
        const {user: {id: userId}, id, firstName, lastName} = await req.body;

        if (id === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.idRequired`),
                    message: {}
                })
        }
        if (firstName === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`register.firstNameRequired`),
                    message: {}
                })
        }
        if (lastName === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`register.lastNameRequired`),
                    message: {}
                })
        }

        const products = ['ANP'];
        User.checkFund(userId, products)
            .then((param) => {
                const {paidCourtesy, paidBalance, paidCredit} = param;
                const personData = {id, firstName, lastName};
                User.createPerson(userId, personData)
                    .then(() => {
                        const price = (paidCourtesy + paidBalance + paidCredit) * -1;
                        User.updateBalances(userId, param)
                            .then(({courtesy, balance, credit}) => {
                                return res.status(200).json({
                                    status: "success",
                                    error: "",
                                    message: {
                                        price,
                                        balances: {
                                            courtesy: {
                                                deducted: paidCourtesy,
                                                remaining: courtesy
                                            },
                                            topUp: {
                                                deducted: paidBalance,
                                                remaining: balance
                                            },
                                            subscription: {
                                                deducted: paidCredit,
                                                remaining: credit
                                            },
                                        },
                                    }
                                })
                            })
                            .catch((err) => {
                                return res.status(500).json({
                                    status: "Failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                })
                            });
                    })
                    .catch((err) => {
                        switch (err) {
                            case 'idMaxLength':
                            case 'nameMaxLength':
                            case 'personIdDuplicate':
                                res.status(400).json({
                                    status: "failed",
                                    error: req.i18n.t(`faceRecognition.${err}`),
                                    message: {}
                                })
                                break;

                            default :
                                res.status(500).json({
                                    status: "failed",
                                    error: err,
                                    message: {}
                                })

                        }
                    })
            })
            .catch((err) => {
                switch (err.toString()) {
                    case 'insufficientBalance':
                    case 'insufficientCredit':
                    case 'subscriptionExpired':
                        return res.status(402).json({
                            status: "Failed",
                            error: req.i18n.t(`subscription.${err.toString()}`),
                            message: {}
                        })
                    default:
                        return res.status(500).json({
                            status: "Failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
            })
    }
    catch (err) {
        return res.status(500).json({
            status: "Failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
    }
}

const updatePersonImages = async (req, res) => {
    try {
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const maxImages = Number(process.env.FR_MAX_UPLOADED_IMAGES);
        const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});

        const {user: {id: userId}, id: personId} = await req.body;
        const uploadedImages = await req.files.length;

        if (personId === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.idRequired`),
                    message: {}
                })
        }
        if (uploadedImages === 0) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.imagesRequired`),
                    message: {}
                })
        }

        User.getPersonData(userId, personId)
            .then(async (person) => {
                const currentImages = person.images.filter((image) => image !== '-').length;
                if (currentImages + uploadedImages > maxImages) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('faceRecognition.excessImages'),
                        message: {
                            currentImages,
                            uploadedImages,
                            maxImages
                        }
                    })
                }
                else {
                    const {fileTypeFromBuffer} = await import('file-type');
                    for (const file of req.files) {
                        const type = await fileTypeFromBuffer(file.buffer);
                        const ext = type['ext'].toString().toLowerCase();
                        const imageTypes = Process.env.FR_FILE_TYPE.split(',');
                        if (!imageTypes.includes(ext)) {
                            return res.status(400).json({
                                status: "Failed",
                                error: req.i18n.t(`faceRecognition.notImageFile`),
                                message: {
                                    imageTypes
                                }
                            })
                        }
                    }
                    const products = new Array(uploadedImages).fill('FER');
                    User.checkFund(userId, products)
                        .then(async (param) => {
                            const {paidCourtesy, paidBalance, paidCredit} = param;
                            const fileKeyList = [];
                            for (const file of req.files) {
                                const width = Number(process.env.FR_MAX_PERSON_IMAGE_WIDTH);
                                const {buffer} = await Image.compress(file.buffer, width);
                                const fileStream = Readable.from(buffer);
                                let fileName = `${file.originalname}@@${new Date().toISOString()}.jpeg`;

                                const fileKey = `${userId}/persons/${person._id}/training/${fileName}`;
                                fileKeyList.push(fileKey);
                                const params = {Bucket: bucket, Key: fileKey, Body: fileStream,};
                                const upload = new Upload({
                                    client,
                                    params,
                                    tags: [], // optional tags
                                    queueSize: 4, // optional concurrency configuration
                                    partSize: 1024 * 1024 * 5, // optional size of each part, in bytes, at least 5MB
                                    leavePartsOnError: false, // optional manually handle dropped parts
                                });
                                upload.done();
                            }
                            const sendfileKeyList = () => {
                                return new Promise(resolve => {
                                    setTimeout(resolve, 1000);
                                    const key = `${userId}/persons/${person._id}/training/${new Date().toISOString()}ENCODE-ME.IMG`;
                                    client.send(new PutObjectCommand({
                                        Bucket: bucket,
                                        Key: key,
                                        Body: fileKeyList.toString()
                                    }));
                                });
                            };
                            sendfileKeyList();
                            const price = (paidCourtesy + paidBalance + paidCredit) * -1;
                            User.updateBalances(userId, param)
                                .then(({courtesy, balance, credit}) => {
                                    return res.status(200).json({
                                        status: "success",
                                        error: "",
                                        message: {
                                            price,
                                            balances: {
                                                courtesy: {
                                                    deducted: paidCourtesy,
                                                    remaining: courtesy
                                                },
                                                topUp: {
                                                    deducted: paidBalance,
                                                    remaining: balance
                                                },
                                                subscription: {
                                                    deducted: paidCredit,
                                                    remaining: credit
                                                },
                                            }
                                        }
                                    })
                                })
                                .catch((err) => {
                                    return res.status(500).json({
                                        status: "Failed",
                                        error: req.i18n.t('general.internalError'),
                                        message: {
                                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                        }
                                    })
                                });
                        })
                        .catch((err) => {
                            switch (err.toString()) {
                                case 'insufficientBalance':
                                case 'insufficientCredit':
                                case 'subscriptionExpired':
                                    return res.status(402).json({
                                        status: "Failed",
                                        error: req.i18n.t(`subscription.${err.toString()}`),
                                        message: {}
                                    })
                                default:
                                    return res.status(500).json({
                                        status: "Failed",
                                        error: req.i18n.t('general.internalError'),
                                        message: {
                                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                        }
                                    })
                            }
                        })
                }
            })
            .catch((err) => {
                if (err === 'invalidPersonId') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t(`faceRecognition.${err}`),
                        message: {}
                    })
                }
                else {
                    return res.status(400).json({
                        status: "Failed",
                        error: err.toString(),
                        message: {}
                    })
                }
            })
    }
    catch (err) {
        return res.status(500).json({
            status: "Failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
    }
}

const recognizeImage = async (req, res) => {
    try {
        let {user: {id: userId}, outputImage} = await req.body;
        let outputImageBool;

        if (outputImage === undefined) {
            outputImageBool = false;
        }
        const uploadedImages = await req.files.length;
        if (uploadedImages === 0) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.imagesRequired`),
                    message: {}
                })
        }
        if (!['true', 'false'].includes(outputImage.toLowerCase())) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.invalidOutputImage`),
                    message: {}
                })
        }
        else {
            outputImageBool = outputImage.toLowerCase() === 'true';
        }

        const {fileTypeFromBuffer} = await import('file-type');
        const type = await fileTypeFromBuffer(req.files[0].buffer);
        const ext = type['ext'].toString().toLowerCase();
        const imageTypes = Process.env.FR_FILE_TYPE.split(',');
        if (!imageTypes.includes(ext)) {
            return res.status(400).json({
                status: "Failed",
                error: req.i18n.t(`faceRecognition.notImageFile`),
                message: {}
            })
        }

        const products = ['FRR'];
        if (outputImageBool) {
            products.push('OIG');
        }
        User.checkFund(userId, products)
            .then(async (param) => {
                const {paidCourtesy, paidBalance, paidCredit} = param;
                const width = integer(process.env.FR_MAX_DETECTION_IMAGE_WIDTH)
                const {buffer, ratio} = await Image.compress(req.files[0].buffer, width);
                const form = new FormData();
                form.append('userId', userId);
                form.append('image', buffer, req.files[0].originalname);
                form.append('outputImage', outputImageBool.toString());
                form.append('ratio', ratio);
                axios.post(process.env.FR_FACE_RECOGNITION_URL, form)
                    .then((msg) => {
                        if (msg.data.status === 'success') {
                            const price = (paidCourtesy + paidBalance + paidCredit) * -1;
                            User.updateBalances(userId, param)
                                .then(({courtesy, balance, credit}) => {
                                    return res.status(200).json({
                                        status: "success",
                                        error: "",
                                        message: {
                                            price,
                                            balances: {
                                                courtesy: {
                                                    deducted: paidCourtesy,
                                                    remaining: courtesy
                                                },
                                                topUp: {
                                                    deducted: paidBalance,
                                                    remaining: balance
                                                },
                                                subscription: {
                                                    deducted: paidCredit,
                                                    remaining: credit
                                                },
                                            },
                                            inference: msg.data.message
                                        }
                                    })
                                })
                                .catch((err) => {
                                    return res.status(500).json({
                                        status: "Failed",
                                        error: req.i18n.t('general.internalError'),
                                        message: {
                                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                        }
                                    })
                                });
                        }
                        else {
                            switch (msg.data.error) {
                                case 'noFacesDetected':
                                case 'notImageFile':
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t(`faceRecognition.${msg.data.error}`),
                                        message: {
                                            code: msg.data.error
                                        }
                                    })

                                default:
                                    return res.status(500).json({
                                        status: "failed",
                                        error: req.i18n.t(`faceRecognition.somethingWrong`),
                                        message: {
                                            code: msg.data.error,
                                            errorText: msg.data.message.err
                                        }
                                    })
                            }
                        }
                    })
                    .catch((err) => {
                        return res.status(500).json({
                            status: "failed",
                            error: req.i18n.t(`faceRecognition.internalError`),
                            message: {
                                code: err.toString()
                            }
                        })
                    })
            })
            .catch((err) => {
                switch (err.toString()) {
                    case 'insufficientBalance':
                    case 'insufficientCredit':
                    case 'subscriptionExpired':
                        return res.status(402).json({
                            status: "Failed",
                            error: req.i18n.t(`subscription.${err.toString()}`),
                            message: {}
                        })
                    default:
                        return res.status(500).json({
                            status: "Failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        })
                }
            })
    }
    catch (err) {
        return res.status(500).json({
            status: "Failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
    }
}

const deletePersonImage = async (req, res) => {
    try {
        const {user: {id: userId}, id: personId, index} = await req.body;

        if (personId === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.idRequired`),
                    message: {}
                })
        }
        if (index === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.indexRequired`),
                    message: {}
                })
        }
        if (!isNumeric(index) || index < 0) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.invalidIndex`),
                    message: {}
                })
        }

        User.getPersonData(userId, personId)
            .then((person) => {
                const imagesList = person.images;
                const region = process.env.S3_REGION;
                const bucket = process.env.S3_BUCKET;
                let url = `https://${bucket}.s3.${region}.amazonaws.com/${userId}/persons/${person._id}/images/`;
                if (index >= imagesList.length || imagesList[index] === '-') {
                    const images = [];
                    for (const i in imagesList) {
                        if (imagesList[i] !== '-') {
                            const fileUrl = `${url}${i}.jpg`;
                            images.push({fileUrl, index: i})
                        }
                    }
                    return res.status(400)
                        .json({
                            status: "failed",
                            error: req.i18n.t(`faceRecognition.incorrectIndex`),
                            message: {images}
                        })
                }

                const form = new FormData();
                form.append('name', `${userId}/${person._id}`);
                form.append('encodingIndex', imagesList[index]);
                axios.post(process.env.FR_FACE_DELETION_URL, form)
                    .then(async (msg) => {
                        if (msg.data.status === 'success') {
                            const accessKeyId = process.env.S3_ACCESS_KEY_ID;
                            const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
                            const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});
                            const key = `${userId}/persons/${person._id}/images/${index}.jpg`;
                            client.send(new DeleteObjectCommand({Bucket: bucket, Key: key}));

                            imagesList[index] = '-';
                            User.updatePersonData(userId, personId, {images: imagesList})
                                .then(() => {
                                    return res.status(200).json({
                                        status: "success",
                                        error: "",
                                        message: {}
                                    })
                                })
                                .catch((err) => {
                                    return res.status(500).json({
                                        status: "Failed",
                                        error: err.toString(),
                                        message: {}
                                    })
                                })
                        }
                        else {
                            return res.status(500).json({
                                status: "failed",
                                error: req.i18n.t(`faceRecognition.somethingWrong`),
                                message: {
                                    code: msg.data.error,
                                    errorText: msg.data.message.err
                                }
                            })
                        }
                    })
                    .catch((err) => {
                        return res.status(500).json({
                            status: "Failed",
                            error: err.toString(),
                            message: {}
                        })
                    })
            })
            .catch((err) => {
                if (err === 'invalidPersonId') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t(`faceRecognition.${err}`),
                        message: {}
                    })
                }
                else {
                    return res.status(500).json({
                        status: "Failed",
                        error: err.toString(),
                        message: {}
                    })
                }
            })
    }
    catch (err) {
        return res.status(500).json({
            status: "Failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
    }
}

const deletePerson = async (req, res) => {
    try {
        const {user: {id: userId}, id: personId} = await req.body;

        if (personId === undefined) {
            return res.status(400)
                .json({
                    status: "failed",
                    error: req.i18n.t(`faceRecognition.idRequired`),
                    message: {}
                })
        }

        User.getPersonData(userId, personId)
            .then((person) => {
                const region = process.env.S3_REGION;
                const bucket = process.env.S3_BUCKET;

                const form = new FormData();
                form.append('name', `${userId}/${person._id}`);
                axios.post(process.env.FR_PERSON_DELETION_URL, form)
                    .then((msg) => {
                        if (msg.data.status === 'success') {
                            const accessKeyId = process.env.S3_ACCESS_KEY_ID;
                            const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
                            const client = new S3Client({region, credentials: {accessKeyId, secretAccessKey}});
                            const key = `${userId}/persons/${person._id}/DELETE-PERSON.ALL`;
                            client.send(new PutObjectCommand({Bucket: bucket, Key: key, Body: key}));

                            User.removePerson(userId, personId)
                                .then(() => {
                                    return res.status(200).json({
                                        status: "success",
                                        error: "",
                                        message: {}
                                    })
                                })
                                .catch((err) => {
                                    return res.status(500).json({
                                        status: "Failed",
                                        error: err.toString(),
                                        message: {}
                                    })
                                })
                        }
                        else {
                            return res.status(500).json({
                                status: "failed",
                                error: req.i18n.t(`faceRecognition.somethingWrong`),
                                message: {
                                    code: msg.data.error,
                                    errorText: msg.data.message.err
                                }
                            })
                        }
                    })
                    .catch((err) => {
                        return res.status(500).json({
                            status: "Failed",
                            error: err.toString(),
                            message: {}
                        })
                    })
            })
            .catch((err) => {
                if (err === 'invalidPersonId') {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t(`faceRecognition.${err}`),
                        message: {}
                    })
                }
                else {
                    return res.status(500).json({
                        status: "Failed",
                        error: err.toString(),
                        message: {}
                    })
                }
            })
    }
    catch (err) {
        return res.status(500).json({
            status: "Failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        })
    }
}

module.exports = {updatePersonImages, addPerson, recognizeImage, deletePersonImage, deletePerson};