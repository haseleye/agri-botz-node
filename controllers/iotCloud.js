const {ArduinoIoTCloud} = require('arduino-iot-js');
const ArduinoIotClient = require('@arduino/arduino-iot-client');
const rp = require('request-promise');
const Users = require('../models/users');
const Devices = require('../models/devices');
const ControlUnits = require('../models/controlUnits');
const Variables = require('../models/variables');
const {isNumeric, isFloat} = require('../utils/numberUtils');
const {generateUUID} = require('../utils/codeGenerator');

const connectClient = () => {
    return new Promise(async (myResolve, myReject) => {
        const client = ArduinoIotClient.ApiClient.instance;
        const oauth2 = client.authentications['oauth2'];
        const clientId = process.env.CLOUD_CLIENT_ID;
        const clientSecret = process.env.CLOUD_CLIENT_SECRET;
        const options = {
            method: 'POST',
            url: 'https://api2.arduino.cc/iot/v1/clients/token',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            json: true,
            form: {
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                audience: 'https://api2.arduino.cc/iot'
            }
        };
        await rp(options)
            .then((response) => {
                oauth2.accessToken = response['access_token'];
                const cloudApi = new ArduinoIotClient.PropertiesV2Api(client);
                myResolve(cloudApi);
            })
            .catch((err) => {
                myReject(err);
            });
    });
}

const addSite = async (req, res) => {
    try {
        const {siteName, targetUserID, user: {id: userID, role}} = await req.body;

        if (siteName === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        const siteId = generateUUID();

        const siteData = {id: siteId, name: siteName, createdAt: new Date()};
        if (role === 'USER') {
            await Users.findOne({_id: userID}, {sites: 1})
                .then(async (user) => {

                    let duplicated = false;
                    user.sites.map((site) => {
                        if (site.name === siteName) {
                            duplicated = true;
                        }
                    });

                    if (duplicated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.duplicated'),
                            message: {}
                        });
                    }

                    await Users.updateOne({_id: userID}, {$push: {sites: siteData}})
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {
                                    siteId
                                }
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });

                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
        else if (role === 'ADMIN') {
            if (targetUserID === undefined) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('iot.notComplete'),
                    message: {}
                });
            }

            if (!targetUserID.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('iot.invalidDataType'),
                        message: {}
                    })
            }

            await Users.findOne({_id: targetUserID}, {sites: 1})
                .then(async (user) => {
                    if (!user) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notCorrect'),
                            message: {}
                        });
                    }

                    let duplicated = false;
                    user.sites.map((site) => {
                        if (site.name === siteName) {
                            duplicated = true;
                        }
                    });

                    if (duplicated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.duplicated'),
                            message: {}
                        });
                    }

                    await Users.updateOne({_id: targetUserID}, {$push: {sites: siteData}})
                        .then(() => {

                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {
                                    siteId
                                }
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });

                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const renameSite = async (req, res) => {
    try {
        const {siteId, newName, user: {id: userID, role}} = await req.body;

        if (siteId === undefined || newName === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        if (role === 'USER') {
            await Users.findOne({'sites.id': siteId}, {_id: 1, sites: 1})
                .then(async (user) => {
                    if (!user) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notCorrect'),
                            message: {}
                        });
                    }

                    if (user._id.toString() !== userID) {
                        return res.status(401).json({
                            status: "failed",
                            error: req.i18n.t('iot.notPermitted'),
                            message: {}
                        });
                    }



                    let duplicated = false;
                    let isTerminated = false;
                    user.sites.map((site) => {
                        if (site.name === newName) {
                            duplicated = true;
                        }
                        if (site.id === siteId && site.isTerminated) {
                            isTerminated = true;
                        }
                    });

                    if (isTerminated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.terminatedSite'),
                            message: {}
                        });
                    }

                    if (duplicated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.duplicated'),
                            message: {}
                        });
                    }

                    await Users.updateOne({'sites.id': siteId}, {$set: {'sites.$.name': newName}})
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {}
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });
                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
        else if (role === 'ADMIN') {
            await Users.findOne({'sites.id': siteId}, {_id: 1, sites: 1})
                .then(async (user) => {
                    if (!user) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notCorrect'),
                            message: {}
                        });
                    }

                    let duplicated = false;
                    let isTerminated = false;
                    user.sites.map((site) => {
                        if (site.name === newName) {
                            duplicated = true;
                        }
                        if (site.id === siteId && site.isTerminated) {
                            isTerminated = true;
                        }
                    });

                    if (isTerminated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.terminatedSite'),
                            message: {}
                        });
                    }

                    if (duplicated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.duplicated'),
                            message: {}
                        });
                    }

                    await Users.updateOne({'sites.id': siteId}, {$set: {'sites.$.name': newName}})
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {}
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });
                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const deleteSite = async (req, res) => {
    try {
        const {siteId, user: {id: userID, role}} = await req.body;

        if (siteId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        if (role === 'USER') {
            await Users.findOne({'sites.id': siteId}, {_id: 1, sites: 1})
                .then(async (user) => {
                    if (!user) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notCorrect'),
                            message: {}
                        });
                    }

                    let nonEmpty = false;
                    user.sites.map((site) => {
                        if (site.id === siteId) {
                            if (site.gadgets.length > 0) {
                                return nonEmpty = true;
                            }
                        }
                    });

                    if (user._id.toString() !== userID) {
                        return res.status(401).json({
                            status: "failed",
                            error: req.i18n.t('iot.notPermitted'),
                            message: {}
                        });
                    }

                    if (nonEmpty) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notEmpty'),
                            message: {}
                        });
                    }

                    await Users.updateOne({'sites.id': siteId}, {$pull: {sites: {id: siteId}}})
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {}
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });
                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
        else if (role === 'ADMIN') {
            await Users.findOne({'sites.id': siteId}, {_id: 1, sites: 1})
                .then(async (user) => {
                    if (!user) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notCorrect'),
                            message: {}
                        });
                    }

                    let nonEmpty = false;
                    user.sites.map((site) => {
                        if (site.id === siteId) {
                            if (site.gadgets.length > 0) {
                                return nonEmpty = true;
                            }
                        }
                    });

                    if (nonEmpty) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notEmpty'),
                            message: {}
                        });
                    }


                    await Users.updateOne({'sites.id': siteId}, {$pull: {sites: {id: siteId}}})
                        .then(() => {
                            res.status(200).json({
                                status: "success",
                                error: "",
                                message: {}
                            });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });
                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const registerControlUnit = async (req, res) => {
    try {
        const {serialNumber, attributes, firmwareVersion} = await req.body;

        if (serialNumber === undefined || attributes === undefined || firmwareVersion === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        const version = firmwareVersion.toString().split('.');
        if (version.length !== 3 || !isNumeric(version[0]) || !isNumeric(version[1]) || !isNumeric(version[2])
            || version[0] < 1 || version[0] > 40 || version[1] <= 0 || version[2] < 0 || version[2] > 9) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.invalidDataType'),
                message: {}
            });
        }

        const valves = version[1].toString().split('');
        if (valves.length !== 2 || parseInt(valves[0]) + parseInt(valves[1]) > 2 ) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.invalidDataType'),
                message: {}
            });
        }

        await ControlUnits.create({_id: serialNumber, attributes, firmwareVersion})
            .then(() => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        info: req.i18n.t('iot.registered', {serialNumber})
                    }
                });
            })
            .catch((err) => {
                if (err.toString().includes('duplicate key error')) {
                    res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.registeredSerial'),
                        message: {}
                    });
                }
                else {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                }
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const gearControlUnit = async (req, res) => {
    try {
        const {serialNumber, deviceId, config} = await req.body;

        if (serialNumber === undefined || deviceId === undefined || config === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await ControlUnits.findOne({_id: serialNumber}, {_id: 1, firmwareVersion: 1})
            .then(async (controlUnit) => {
                if (!controlUnit) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                const versionParts = controlUnit.firmwareVersion.toString().split('.');
                const solenoidCount = parseInt(versionParts[1].toString().split('')[0]);
                const relayCount = parseInt(versionParts[1].toString().split('')[1]);
                if (solenoidCount === 1) {
                    if (config.solenoid1Pin1 === undefined || config.solenoid1Pin2 === undefined) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.missingSolenoid1'),
                            message: {}
                        });
                    }
                }
                else if (solenoidCount === 2) {
                    if (config.solenoid1Pin1 === undefined || config.solenoid1Pin2 === undefined
                        || config.solenoid2Pin1 === undefined || config.solenoid2Pin2 === undefined) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.missingSolenoid2'),
                            message: {}
                        });
                    }
                }

                if (relayCount === 1) {
                    if (config.relay1Pin === undefined) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.missingRelay1'),
                            message: {}
                        });
                    }
                }
                else if (relayCount === 2) {
                    if (config.relay1Pin === undefined || config.relay2Pin === undefined) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.missingRelay2'),
                            message: {}
                        });
                    }
                }

                await Devices.findOne({_id: deviceId}, {_id: 1, isTerminated: 1, controlUnitId: 1})
                    .then(async (device) => {
                        if (!device) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.notCorrect'),
                                message: {}
                            });
                        }

                        if (device.isTerminated) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.terminatedDevice'),
                                message: {}
                            });
                        }

                        if (device.controlUnitId !== undefined && device.controlUnitId !== serialNumber) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.usedDevice'),
                                message: {}
                            });
                        }

                        device.controlUnitId = serialNumber;
                        await device.save()
                            .then(async () => {
                                await ControlUnits.updateOne({_id: serialNumber}, {deviceId, config})
                                    .then(() => {
                                        res.status(200).json({
                                            status: "success",
                                            error: "",
                                            message: {}
                                        });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const configureControlUnit = async (req, res) => {
    try {
        const {serialNumber} = await req.body;

        if (serialNumber === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await ControlUnits.findOne({_id: serialNumber}, {deviceId: 1, config: 1})
            .then(async (controlUnit) => {
                if (!controlUnit) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.incorrectSerial'),
                        message: {}
                    });
                }

                if (controlUnit.deviceId === undefined) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notConfiguredCU'),
                        message: {}
                    });
                }

                await Devices.findOne({_id: controlUnit.deviceId}, {secretKey: 1})
                    .then((device) => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {
                                deviceId: controlUnit.deviceId,
                                secretKey: device.secretKey,
                                config: controlUnit.config,
                                info: req.i18n.t('iot.configured'),
                            }
                        });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const addDevice = async (req, res) => {
    try {
        const {deviceId, secretKey, thingId} = await req.body;

        if (deviceId === undefined || secretKey === undefined || thingId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Devices.create({_id: deviceId, secretKey, thingId})
            .then(() => {
                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {}
                });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const updateDeviceGPS = async (req, res) => {
    try {
        const {deviceId, gps, user: {id: userID}} = await req.body;

        if (deviceId === undefined || gps === undefined || gps.lat === undefined || gps.long === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        if (!isNumeric(gps.lat) || !isNumeric(gps.long)) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.invalidDataType'),
                message: {}
            });
        }

        await Devices.findOne({_id: deviceId}, {userID: 1})
            .then(async (device) => {
                if (!device) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (device.userID === undefined) {
                    return res.status(401).json({
                        status: "failed",
                        error: req.i18n.t('iot.notLinked'),
                        message: {}
                    });
                }

                if (device.userID !== userID) {
                    return res.status(401).json({
                        status: "failed",
                        error: req.i18n.t('iot.notPermitted'),
                        message: {}
                    });
                }

                await Devices.updateOne({_id: deviceId}, {gps})
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const addGadget = async (req, res) => {
    try {
        const {type, name, siteId, deviceId} = await req.body;

        if (type === undefined || name === undefined || siteId === undefined || deviceId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        if (!['solenoid valve', 'sensor'].includes(type.toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notCorrect'),
                message: {}
            });
        }

        await Users.findOne({'sites.id': siteId}, {_id: 1, sites: 1})
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                let duplicate;
                user.sites.map((site) => {
                    if (site.id === siteId) {
                        const gadgetsSet = new Set();
                        site.gadgets.map((gadget) => {
                            const gadgetString =  gadget.type.toString() + gadget.name.toString();
                            gadgetsSet.add(gadgetString);
                        });
                        const count = gadgetsSet.size;
                        const newGadgetString =  type.toString() + name.toString();
                        gadgetsSet.add(newGadgetString);
                        const newCount = gadgetsSet.size;
                        duplicate = count === newCount;
                    }
                });

                if (duplicate) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.duplicated'),
                        message: {}
                    });
                }

                await Devices.findOne({_id: deviceId}, {userID: 1, siteId: 1})
                    .then(async (device) => {
                        if (!device) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.notCorrect'),
                                message: {}
                            });
                        }

                        if (device.siteId !== undefined && device.siteId !== siteId) {
                            return res.status(401).json({
                                status: "failed",
                                error: req.i18n.t('iot.occupied'),
                                message: {}
                            });
                        }

                        await Devices.updateOne({_id: deviceId}, {userID: user._id, siteId})
                            .then(() => {
                                user.sites.map(async (site) => {
                                    if (site.id === siteId) {
                                        const gadget = {id: generateUUID(), type, name, deviceId};
                                        site.gadgets.push(gadget);

                                        await user.save()
                                            .then(() => {
                                                Variables.updateMany({deviceId}, {userID: user._id})
                                                    .then(() => {
                                                        res.status(200).json({
                                                            status: "success",
                                                            error: "",
                                                            message: {
                                                                gadgetId: gadget.id
                                                            }
                                                        });
                                                    })
                                                    .catch((err) => {
                                                        return res.status(500).json({
                                                            status: "failed",
                                                            error: req.i18n.t('general.internalError'),
                                                            message: {
                                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                            }
                                                        });
                                                    });
                                            })
                                            .catch((err) => {
                                                return res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    }
                                });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const renameGadget = async (req, res) => {
    try {
        const {gadgetId, newName, user: {id: userID}} = await req.body;

        if (newName === undefined || gadgetId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Users.findOne({'sites.gadgets.id': gadgetId}, {_id: 1, sites: 1})
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (user._id.toString() !== userID) {
                    return res.status(401).json({
                        status: "failed",
                        error: req.i18n.t('iot.notPermitted'),
                        message: {}
                    });
                }

                let siteId, type;
                user.sites.map((site) => {
                    site.gadgets.map((gadget) => {
                        if (gadget.id === gadgetId) {
                            siteId = site.id;
                            type = gadget.type;
                        }
                    });
                });

                let duplicate;
                let isTerminated = false;
                user.sites.map((site) => {
                    if (site.id === siteId) {
                        const gadgetsSet = new Set();
                        site.gadgets.map((gadget) => {
                            const gadgetString =  gadget.type.toString() + gadget.name.toString();
                            gadgetsSet.add(gadgetString);
                        });
                        const count = gadgetsSet.size;
                        const newGadgetString =  type.toString() + newName.toString();
                        gadgetsSet.add(newGadgetString);
                        const newCount = gadgetsSet.size;
                        duplicate = count === newCount;

                        if (site.isTerminated) {
                            isTerminated = true;
                        }
                    }
                });

                if (isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedSite'),
                        message: {}
                    });
                }

                if (duplicate) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.duplicated'),
                        message: {}
                    });
                }

                await Users.updateOne({'sites.gadgets.id': gadgetId},
                    {$set: {'sites.$.gadgets.$[inner].name': newName}},
                    {arrayFilters: [{'inner.id': gadgetId}]})
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const addVariable = async (req, res) => {
    try {
        const {variableId, name, type, value, deviceId} = await req.body;
        let variableValue;

        if (variableId === undefined || name === undefined || type === undefined || value === undefined || deviceId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        if (!['integer', 'float', 'string', 'boolean', 'schedule'].includes(type.toString().toLowerCase())) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notCorrect'),
                message: {}
            });
        }

        Devices.findOne({'_id': deviceId}, {thingId: 1, userID: 1})
            .then(async (device) => {
                if (!device) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                switch (type.toString().toLowerCase()) {
                    case 'schedule':
                        let msk;
                        const repeatEvery = ['does not repeat', 'hour', 'day', 'week', 'month', 'year'];
                        if (value.frm === undefined || !isNumeric(value.frm) || value.len === undefined || !isNumeric(value.len)
                            || value.repeatEvery === undefined || !repeatEvery.includes(value.repeatEvery.toString().toLowerCase())) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.invalidDataType'),
                                message: {}
                            });
                        }

                        switch (value.repeatEvery.toString().toLowerCase()) {
                            case 'does not repeat':
                                msk = createScheduleMask('does not repeat');
                                if (msk === -1) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                variableValue = {
                                    frm: value.frm,
                                    to: 0,
                                    len: value.len,
                                    msk
                                };
                                break;

                            case 'hour':
                            case 'day':
                                if (value.to === undefined || !isNumeric(value.to)) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                msk = createScheduleMask(value.repeatEvery.toString().toLocaleLowerCase());
                                if (msk === -1) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                variableValue = {
                                    frm: value.frm,
                                    to: value.to,
                                    len: value.len,
                                    msk
                                };
                                break;

                            case 'week':
                                if (value.to === undefined || !isNumeric(value.to) || value.selectedDays === undefined
                                    || !Array.isArray(value.selectedDays) || value.selectedDays.length === 0) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                msk = createScheduleMask('week', 1, value.selectedDays);
                                if (msk === -1) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                variableValue = {
                                    frm: value.frm,
                                    to: value.to,
                                    len: value.len,
                                    msk
                                };
                                break;

                            case 'month':
                                if (value.to === undefined || !isNumeric(value.to) || value.dayOfMonth === undefined) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                msk = createScheduleMask('month', 1, null, value.dayOfMonth);
                                if (msk === -1) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                variableValue = {
                                    frm: value.frm,
                                    to: value.to,
                                    len: value.len,
                                    msk
                                };
                                break;

                            case 'year':
                                if (value.to === undefined || !isNumeric(value.to)
                                    || value.month === undefined || value.dayOfMonth === undefined) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                msk = createScheduleMask('year', 1, null, value.dayOfMonth, value.month);
                                if (msk === -1) {
                                    return res.status(400).json({
                                        status: "failed",
                                        error: req.i18n.t('iot.invalidDataType'),
                                        message: {}
                                    });
                                }
                                variableValue = {
                                    frm: value.frm,
                                    to: value.to,
                                    len: value.len,
                                    msk
                                };
                                break;
                        }
                        break;

                    case 'integer':
                        if (value.equal === undefined || !isNumeric(value.equal)) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.invalidDataType'),
                                message: {}
                            });
                        }
                        variableValue = Number(value.equal);
                        break;

                    case 'float':
                        if (value.equal === undefined || (!isFloat(value.equal) && !isNumeric(value.equal))) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.invalidDataType'),
                                message: {}
                            });
                        }
                        variableValue = Number(value.equal);
                        break;

                    case 'string':
                        if (value.equal === undefined) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.invalidDataType'),
                                message: {}
                            });
                        }
                        variableValue = value.equal.toString();
                        break;

                    case 'boolean':
                        if (value.equal === undefined || !['true', 'false'].includes(value.equal.toString().toLowerCase())) {
                            return res.status(400).json({
                                status: "failed",
                                error: req.i18n.t('iot.invalidDataType'),
                                message: {}
                            });
                        }
                        variableValue = value.equal.toString().toLowerCase() === 'true';
                        break;
                }

                const variableData = {
                    _id: variableId,
                    name,
                    type,
                    value: variableValue,
                    deviceId,
                    thingId: device.thingId,
                    userID: device.userID
                };
                await Variables.create(variableData)
                    .then(() => {
                        res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const updateVariable = async (req, res) => {
    try {
        const {variableId, value, user: {id: userID}} = await req.body;
        let variableName, variableValue;

        if (variableId === undefined || value === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Variables.findOne({_id: variableId})
            .then(async (variable) => {
                if (!variable) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }
                else {

                    if (variable.userID !== userID) {
                        return res.status(401).json({
                            status: "failed",
                            error: req.i18n.t('iot.notPermitted'),
                            message: {}
                        });
                    }

                    variableName = variable.name;
                    switch (variable.type.toString().toLowerCase()) {
                        case 'schedule':
                            let msk;
                            const repeatEvery = ['does not repeat', 'hour', 'day', 'week', 'month', 'year'];
                            if (value.frm === undefined || !isNumeric(value.frm) || value.len === undefined || !isNumeric(value.len)
                                || value.repeatEvery === undefined || !repeatEvery.includes(value.repeatEvery.toString().toLowerCase())) {
                                return res.status(400).json({
                                    status: "failed",
                                    error: req.i18n.t('iot.invalidDataType'),
                                    message: {}
                                });
                            }

                            switch (value.repeatEvery.toString().toLowerCase()) {
                                case 'does not repeat':
                                    msk = createScheduleMask('does not repeat');
                                    if (msk === -1) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    variableValue = {
                                        frm: value.frm,
                                        to: 0,
                                        len: value.len,
                                        msk
                                    };
                                    break;

                                case 'hour':
                                case 'day':
                                    if (value.to === undefined || !isNumeric(value.to)) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    msk = createScheduleMask(value.repeatEvery.toString().toLocaleLowerCase());
                                    if (msk === -1) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    variableValue = {
                                        frm: value.frm,
                                        to: value.to,
                                        len: value.len,
                                        msk
                                    };
                                    break;

                                case 'week':
                                    if (value.to === undefined || !isNumeric(value.to) || value.selectedDays === undefined
                                        || !Array.isArray(value.selectedDays) || value.selectedDays.length === 0) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    msk = createScheduleMask('week', 1, value.selectedDays);
                                    if (msk === -1) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    variableValue = {
                                        frm: value.frm,
                                        to: value.to,
                                        len: value.len,
                                        msk
                                    };
                                    break;

                                case 'month':
                                    if (value.to === undefined || !isNumeric(value.to) || value.dayOfMonth === undefined) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    msk = createScheduleMask('month', 1, null, value.dayOfMonth);
                                    if (msk === -1) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    variableValue = {
                                        frm: value.frm,
                                        to: value.to,
                                        len: value.len,
                                        msk
                                    };
                                    break;

                                case 'year':
                                    if (value.to === undefined || !isNumeric(value.to)
                                        || value.month === undefined || value.dayOfMonth === undefined) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    msk = createScheduleMask('year', 1, null, value.dayOfMonth, value.month);
                                    if (msk === -1) {
                                        return res.status(400).json({
                                            status: "failed",
                                            error: req.i18n.t('iot.invalidDataType'),
                                            message: {}
                                        });
                                    }
                                    variableValue = {
                                        frm: value.frm,
                                        to: value.to,
                                        len: value.len,
                                        msk
                                    };
                                    break;
                            }
                            break;

                        case 'integer':
                            if (value.equal === undefined || !isNumeric(value.equal)) {
                                return res.status(400).json({
                                    status: "failed",
                                    error: req.i18n.t('iot.invalidDataType'),
                                    message: {}
                                });
                            }
                            variableValue = Number(value.equal);
                            break;

                        case 'float':
                            if (value.equal === undefined || (!isFloat(value.equal) && !isNumeric(value.equal))) {
                                return res.status(400).json({
                                    status: "failed",
                                    error: req.i18n.t('iot.invalidDataType'),
                                    message: {}
                                });
                            }
                            variableValue = Number(value.equal);
                            break;

                        case 'string':
                            if (value.equal === undefined) {
                                return res.status(400).json({
                                    status: "failed",
                                    error: req.i18n.t('iot.invalidDataType'),
                                    message: {}
                                });
                            }
                            variableValue = value.equal.toString();
                            break;

                        case 'boolean':
                            if (value.equal === undefined || !['true', 'false'].includes(value.equal.toString().toLowerCase())) {
                                return res.status(400).json({
                                    status: "failed",
                                    error: req.i18n.t('iot.invalidDataType'),
                                    message: {}
                                });
                            }
                            variableValue = value.equal.toString().toLowerCase() === 'true';
                            break;
                    }

                    const propertyValue = {
                        value: variableValue
                    };
                    await connectClient()
                        .then((cloudApi) => {
                            cloudApi.propertiesV2Publish(variable.thingId, variableId, propertyValue)
                                .then(() => {
                                    return res.status(200).json({
                                        status: "success",
                                        error: "",
                                        message: {}
                                    });
                                })
                                .catch((err) => {
                                    res.status(500).json({
                                        status: "failed",
                                        error: req.i18n.t('general.internalError'),
                                        message: {
                                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                        }
                                    });
                                });
                        })
                        .catch((err) => {
                            res.status(500).json({
                                status: "failed",
                                error: req.i18n.t('general.internalError'),
                                message: {
                                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                }
                            });
                        });
                }
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const activateSite = async (req, res) => {
    try {
        const {siteId} = await req.body;

        if (siteId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Users.findOne({'sites.id': siteId}, {sites: 1})
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                const devicesSet = new Set;
                let isActive = false;
                let isTerminated = false;
                user.sites.map((site) => {
                    if (site.id === siteId) {
                        if (site.isActive) {
                            isActive = true;
                        }
                        else {
                            if (site.isTerminated) {
                                isTerminated = true;
                            }
                            else {
                                site.gadgets.map((gadget) => {
                                    devicesSet.add(gadget.deviceId);
                                });                            }
                        }
                    }
                });
                if (isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedSite'),
                        message: {}
                    });
                }

                if (isActive) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.activatedSite'),
                        message: {}
                    });
                }

                await Users.updateOne({'sites.id': siteId}, {'sites.$.isActive' : true, 'sites.$.activatedAt' : new Date()})
                    .then(async () => {
                        const devices = [...devicesSet];
                        Devices.updateMany({_id: devices}, {isActive: true})
                            .then( () => {
                                Variables.find({deviceId: devices, name: 'isActive'}, {_id: 1, thingId: 1, value: 1})
                                    .then(async (variables) => {
                                        await Variables.updateMany({deviceId: devices, name: 'isActive'}, {value: true})
                                            .then(async () => {
                                                await connectClient()
                                                    .then(async (cloudApi) => {
                                                        for (let i = 0; i < variables.length; i++) {
                                                            const thingId = variables[i].thingId;
                                                            const variableId = variables[i]._id;
                                                            const propertyValue = {
                                                                value: true
                                                            };
                                                            await cloudApi.propertiesV2Publish(thingId, variableId, propertyValue);
                                                        }

                                                        res.status(200).json({
                                                            status: "success",
                                                            error: "",
                                                            message: {}
                                                        });
                                                    })
                                                    .catch((err) => {
                                                        res.status(500).json({
                                                            status: "failed",
                                                            error: req.i18n.t('general.internalError'),
                                                            message: {
                                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                            }
                                                        });
                                                    });
                                            })
                                            .catch((err) => {
                                                res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const deactivateSite = async (req, res) => {
    try {
        const {siteId} = await req.body;

        if (siteId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Users.findOne({'sites.id': siteId}, {sites: 1})
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                const deviceIdSet = new Set;
                let isActive = true;
                let isTerminated = false;
                user.sites.map((site) => {
                    if (site.id === siteId) {
                        if (!site.isActive) {
                            isActive = false;
                            if (site.isTerminated) {
                                isTerminated = true;
                            }
                        }
                        else {
                            site.gadgets.map((gadget) => {
                                deviceIdSet.add(gadget.deviceId);
                            });
                        }
                    }
                });
                if (isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedSite'),
                        message: {}
                    });
                }

                if (!isActive) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.deactivatedSite'),
                        message: {}
                    });
                }

                await Users.updateOne({'sites.id': siteId}, {'sites.$.isActive' : false, 'sites.$.deactivatedAt' : new Date()})
                    .then(async () => {
                        const devices = [...deviceIdSet];
                        await Devices.updateMany({_id: devices}, {isActive: false})
                            .then( () => {
                                Variables.find({deviceId: devices, name: 'isActive'}, {_id: 1, thingId: 1, value: 1})
                                    .then(async (variables) => {
                                        await Variables.updateMany({deviceId: devices, name: 'isActive'}, {value: false})
                                            .then(async () => {
                                                await connectClient()
                                                    .then(async (cloudApi) => {
                                                        for (let i = 0; i < variables.length; i++) {
                                                            const thingId = variables[i].thingId;
                                                            const variableId = variables[i]._id;
                                                            const propertyValue = {
                                                                value: false
                                                            };
                                                            await cloudApi.propertiesV2Publish(thingId, variableId, propertyValue);
                                                        }

                                                        res.status(200).json({
                                                            status: "success",
                                                            error: "",
                                                            message: {}
                                                        });
                                                    })
                                                    .catch((err) => {
                                                        res.status(500).json({
                                                            status: "failed",
                                                            error: req.i18n.t('general.internalError'),
                                                            message: {
                                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                            }
                                                        });
                                                    });
                                            })
                                            .catch((err) => {
                                                res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const terminateSite = async (req, res) => {
    try {
        const {siteId} = await req.body;

        if (siteId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Users.findOne({'sites.id': siteId}, {sites: 1})
            .then(async (user) => {
                if (!user) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                const deviceIdSet = new Set;
                let isTerminated = false;
                let isActive = false;
                user.sites.map((site) => {
                    if (site.id === siteId) {
                        if (site.isTerminated) {
                            isTerminated = true;
                        }
                        else if (site.isActive) {
                            isActive = true;
                        }
                        else {
                            site.gadgets.map((gadget) => {
                                deviceIdSet.add(gadget.deviceId);
                            });
                        }
                    }
                });
                if (isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedSite'),
                        message: {}
                    });
                }
                if (isActive) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.activeSite'),
                        message: {}
                    });
                }

                const siteUpdate = {'sites.$.isTerminated' : true, 'sites.$.terminatedAt' : new Date()}
                await Users.updateOne({'sites.id': siteId}, siteUpdate)
                    .then(async () => {
                        const devices = [...deviceIdSet];
                        await Devices.updateMany({_id: devices}, {isTerminated: true})
                            .then( () => {
                                Variables.find({deviceId: devices, name: 'isTerminated'}, {_id: 1, thingId: 1, value: 1})
                                    .then(async (variables) => {
                                        await Variables.updateMany({deviceId: devices, name: 'isTerminated'}, {value: true})
                                            .then(async () => {
                                                await connectClient()
                                                    .then(async (cloudApi) => {
                                                        for (let i = 0; i < variables.length; i++) {
                                                            const thingId = variables[i].thingId;
                                                            const variableId = variables[i]._id;
                                                            const propertyValue = {
                                                                value: true
                                                            };
                                                            await cloudApi.propertiesV2Publish(thingId, variableId, propertyValue);
                                                        }

                                                        res.status(200).json({
                                                            status: "success",
                                                            error: "",
                                                            message: {}
                                                        });
                                                    })
                                                    .catch((err) => {
                                                        res.status(500).json({
                                                            status: "failed",
                                                            error: req.i18n.t('general.internalError'),
                                                            message: {
                                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                            }
                                                        });
                                                    });
                                            })
                                            .catch((err) => {
                                                res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const activateDevice = async (req, res) => {
    try {
        const {deviceId} = await req.body;

        if (deviceId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Devices.findOne({_id: deviceId}, {_id: 1, isActive: 1, isTerminated: 1, userID: 1})
            .then(async (device) => {
                if (!device) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (device.isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedDevice'),
                        message: {}
                    });
                }

                if (device.isActive) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.activatedDevice'),
                        message: {}
                    });
                }

                if (device.userID === undefined) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notLinked'),
                        message: {}
                    });
                }

                Devices.updateOne({_id: device._id}, {isActive: true})
                    .then( () => {
                        Variables.findOne({deviceId: device._id, name: 'isActive'}, {_id: 1, thingId: 1, value: 1})
                            .then(async (variable) => {
                                await Variables.updateOne({deviceId: device._id, name: 'isActive'}, {value: true})
                                    .then(async () => {
                                        await connectClient()
                                            .then(async (cloudApi) => {
                                                const thingId = variable.thingId;
                                                const variableId = variable._id;
                                                const propertyValue = {
                                                    value: true
                                                };
                                                await cloudApi.propertiesV2Publish(thingId, variableId, propertyValue);

                                                res.status(200).json({
                                                    status: "success",
                                                    error: "",
                                                    message: {}
                                                });
                                            })
                                            .catch((err) => {
                                                res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const deactivateDevice = async (req, res) => {
    try {
        const {deviceId} = await req.body;

        if (deviceId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Devices.findOne({_id: deviceId}, {_id: 1, isActive: 1, isTerminated: 1})
            .then(async (device) => {
                if (!device) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (device.isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedDevice'),
                        message: {}
                    });
                }

                if (!device.isActive) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.deactivatedDevice'),
                        message: {}
                    });
                }

                Devices.updateOne({_id: device._id}, {isActive: false})
                    .then( () => {
                        Variables.findOne({deviceId: device._id, name: 'isActive'}, {_id: 1, thingId: 1, value: 1})
                            .then(async (variable) => {
                                await Variables.updateOne({deviceId: device._id, name: 'isActive'}, {value: false})
                                    .then(async () => {
                                        await connectClient()
                                            .then(async (cloudApi) => {
                                                const thingId = variable.thingId;
                                                const variableId = variable._id;
                                                const propertyValue = {
                                                    value: false
                                                };
                                                await cloudApi.propertiesV2Publish(thingId, variableId, propertyValue);

                                                res.status(200).json({
                                                    status: "success",
                                                    error: "",
                                                    message: {}
                                                });
                                            })
                                            .catch((err) => {
                                                console.log(err)
                                                res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const terminateDevice = async (req, res) => {
    try {
        const {deviceId} = await req.body;

        if (deviceId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Devices.findOne({_id: deviceId}, {_id: 1, isActive: 1, isTerminated: 1})
            .then(async (device) => {
                if (!device) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (device.isTerminated) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.terminatedDevice'),
                        message: {}
                    });
                }

                if (device.isActive) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.activeDevice'),
                        message: {}
                    });
                }

                Devices.updateOne({_id: device._id}, {isTerminated: true})
                    .then( () => {
                        Variables.findOne({deviceId: device._id, name: 'isTerminated'}, {_id: 1, thingId: 1, value: 1})
                            .then(async (variable) => {
                                await Variables.updateOne({deviceId: device._id, name: 'isTerminated'}, {value: true})
                                    .then(async () => {
                                        await connectClient()
                                            .then(async (cloudApi) => {
                                                const thingId = variable.thingId;
                                                const variableId = variable._id;
                                                const propertyValue = {
                                                    value: true
                                                };
                                                await cloudApi.propertiesV2Publish(thingId, variableId, propertyValue);

                                                res.status(200).json({
                                                    status: "success",
                                                    error: "",
                                                    message: {}
                                                });
                                            })
                                            .catch((err) => {
                                                res.status(500).json({
                                                    status: "failed",
                                                    error: req.i18n.t('general.internalError'),
                                                    message: {
                                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                                    }
                                                });
                                            });
                                    })
                                    .catch((err) => {
                                        res.status(500).json({
                                            status: "failed",
                                            error: req.i18n.t('general.internalError'),
                                            message: {
                                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                            }
                                        });
                                    });
                            })
                            .catch((err) => {
                                res.status(500).json({
                                    status: "failed",
                                    error: req.i18n.t('general.internalError'),
                                    message: {
                                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                                    }
                                });
                            });
                    })
                    .catch((err) => {
                        res.status(500).json({
                            status: "failed",
                            error: req.i18n.t('general.internalError'),
                            message: {
                                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                            }
                        });
                    });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const getUserSites = async (req, res) => {
    try {
        let {targetUserID, user: {id: userID, role}} = await req.body;

        if (role === "ADMIN") {
            if (targetUserID === undefined) {
                return res.status(400).json({
                    status: "failed",
                    error: req.i18n.t('iot.notComplete'),
                    message: {}
                });
            }

            if (!targetUserID.match(/^[0-9a-fA-F]{24}$/)) {
                return res.status(400).json(
                    {
                        status: "failed",
                        error: req.i18n.t('iot.invalidDataType'),
                        message: {}
                    })
            }

            await Users.findOne({_id: targetUserID}, {sites: 1})
                .then((user) => {
                    if (!user) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.notCorrect'),
                            message: {}
                        });
                    }

                    const siteList = [];
                    let siteInfo = {};
                    user.sites.map((site) => {
                        siteInfo.id = site.id;
                        siteInfo.name = site.name;
                        siteInfo.isActive = site.isActive;
                        siteInfo.isTerminated = site.isTerminated;
                        siteInfo.createdAt = site.createdAt;
                        siteInfo.activatedAt = site.activatedAt;
                        siteInfo.deactivatedAt = site.deactivatedAt;
                        siteInfo.terminatedAt = site.terminatedAt;

                        siteList.push(siteInfo);
                        siteInfo = {};
                    });

                    res.status(200).json({
                        status: "success",
                        error: "",
                        message: {
                            sites: siteList,
                        }
                    });

                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }

        else {
            await Users.findOne({_id: userID}, {sites: 1})
                .then((user) => {

                    const siteList = [];
                    let siteInfo = {};
                    user.sites.map((site) => {
                        siteInfo.id = site.id;
                        siteInfo.name = site.name;
                        siteInfo.isActive = site.isActive;
                        siteInfo.isTerminated = site.isTerminated;
                        siteInfo.createdAt = site.createdAt;
                        siteInfo.activatedAt = site.activatedAt;
                        siteInfo.deactivatedAt = site.deactivatedAt;
                        siteInfo.terminatedAt = site.terminatedAt;

                        siteList.push(siteInfo);
                        siteInfo = {};
                    });

                    res.status(200).json({
                        status: "success",
                        error: "",
                        message: {
                            sites: siteList,
                        }
                    });

                })
                .catch((err) => {
                    res.status(500).json({
                        status: "failed",
                        error: req.i18n.t('general.internalError'),
                        message: {
                            info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                        }
                    });
                });
        }
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const getSiteInfo = async (req, res) => {
    try {
        const {siteId, user: {id: userID, role}} = await req.body;

        if (siteId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Users.findOne({'sites.id': siteId}, {_id: 1, firstName: 1, lastName: 1, mobile: 1, 'sites.$': 1})
            .then((user) => {
                if (!user) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (role === 'USER') {
                    if (user._id.toString() !== userID) {
                        return res.status(401).json({
                            status: "failed",
                            error: req.i18n.t('iot.notPermitted'),
                            message: {}
                        });
                    }

                    let isTerminated = false;
                    user.sites.map((site) => {
                        if (site.id === siteId && site.isTerminated) {
                            isTerminated = true;
                        }
                    });
                    if (isTerminated) {
                        return res.status(400).json({
                            status: "failed",
                            error: req.i18n.t('iot.terminatedSite'),
                            message: {}
                        });
                    }
                }

                let userInfo = undefined;
                if (role === 'ADMIN') {
                    userInfo = {
                        name : `${user.firstName} ${user.lastName}`,
                        mobile: user.mobile.primary.number,
                    }
                }

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        userInfo,
                        siteInfo: user.sites
                    }
                })
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const getDeviceInfo = async (req, res) => {
    try {
        const {deviceId, user: {id: userID, role}} = await req.body;

        if (deviceId === undefined) {
            return res.status(400).json({
                status: "failed",
                error: req.i18n.t('iot.notComplete'),
                message: {}
            });
        }

        await Devices.findOne({_id: deviceId})
            .then(async (device) => {
                if (!device) {
                    return res.status(400).json({
                        status: "failed",
                        error: req.i18n.t('iot.notCorrect'),
                        message: {}
                    });
                }

                if (role === 'USER') {
                    if (device.userID === undefined || device.userID !== userID) {
                        return res.status(401).json({
                            status: "failed",
                            error: req.i18n.t('iot.notPermitted'),
                            message: {}
                        });
                    }

                    if (device.isTerminated) {
                        return res.status(401).json({
                            status: "failed",
                            error: req.i18n.t('iot.terminatedDevice'),
                            message: {}
                        });
                    }
                }

                let deviceInfo = {};
                if (role === 'USER') {
                    deviceInfo = {
                        id: device._id,
                        siteId: device.siteId,
                        siteName: "",
                        gps: device.gps
                    };
                }
                else {
                    deviceInfo = {
                        id: device._id,
                        siteId: device.siteId,
                        siteName: "",
                        gps: device.gps,
                        isActive: device.isActive,
                        isTerminated: device.isTerminated
                    };
                }

                let userInfo = undefined;
                const variables = await Variables.find({deviceId}, {userID: 0, deviceId: 0,  __v: 0});

                if (device.userID !== undefined) {
                    const user = await Users.findOne({_id: device.userID}, {firstName: 1, lastName: 1, mobile: 1, sites: 1});
                    user.sites.map((site) => {
                        if (site.id === device.siteId) {
                            deviceInfo.siteName = site.name;
                        }
                    })
                    if (role === 'ADMIN') {
                        userInfo = {};
                        userInfo.name = `${user.firstName} ${user.lastName}`;
                        userInfo.mobile = user.mobile.primary.number;
                    }
                }

                res.status(200).json({
                    status: "success",
                    error: "",
                    message: {
                        deviceInfo,
                        userInfo,
                        variables
                    }
                });
            })
            .catch((err) => {
                res.status(500).json({
                    status: "failed",
                    error: req.i18n.t('general.internalError'),
                    message: {
                        info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                    }
                });
            });
    }
    catch (err) {
        res.status(500).json({
            status: "failed",
            error: req.i18n.t('general.internalError'),
            message: {
                info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
            }
        });
    }
}

const createScheduleMask = (repeatEvery, intervalValue = 1, selectedDays = null, dayOfMonth = null, month = null) => {
    let scheduleUnit = 0;
    let scheduleType = 0;
    let repetition = 0;
    let weekMask = 0;
    let dayMask = 0;
    let monthMask = 0;
    let mask = 0;

    switch (repeatEvery) {
        case "does not repeat":
            scheduleType = 0; // OneShot
            break;
        case "hour":
            scheduleType = 1; // FixedDelta
            scheduleUnit = 2; // Hours
            repetition = 1;
            break;

        case "day":
            scheduleType = 1; // FixedDelta
            scheduleUnit = 3; // Days
            repetition = 1;
            break;

        case "week":
            scheduleType = 2; // Weekly
            if (selectedDays && Array.isArray(selectedDays)) {
                for (let i = 0; i < selectedDays.length; i++) {
                    switch (selectedDays[i].toString().toLowerCase()) {
                        case "sun": weekMask |= (1 << 0); break;
                        case "mon": weekMask |= (1 << 1); break;
                        case "tue": weekMask |= (1 << 2); break;
                        case "wed": weekMask |= (1 << 3); break;
                        case "thu": weekMask |= (1 << 4); break;
                        case "fri": weekMask |= (1 << 5); break;
                        case "sat": weekMask |= (1 << 6); break;
                        default: return -1;
                    }
                }
            }
            else return -1;
            break;

        case "month":
            if (dayOfMonth > 31 || dayOfMonth < 1) return -1;
            scheduleType = 3; // Monthly
            dayMask = dayOfMonth || 1;
            break;

        case "year":
            if (dayOfMonth > 31 || dayOfMonth < 1) return -1;
            scheduleType = 4; // Yearly
            dayMask = dayOfMonth || 1;
            if (month) {
                const monthIndex = [
                    "jan", "feb", "mar", "apr", "may", "jun",
                    "jul", "aug", "sep", "oct", "nov", "dec"
                ].indexOf(month.toString().toLowerCase());
                if (monthIndex !== -1) {
                    monthMask = monthIndex;
                }
                else return -1;
            }
            break;
        default:
            console.error("Unknown repeatEvery value:", repeatEvery);
            return -1;
    }

    mask = (scheduleUnit << 30) >>> 0;
    mask |= (scheduleType << 26) >>> 0;

    switch (scheduleType) {
        case 1: // FixedDelta
            mask |= (repetition & 0x03FFFFFF);
            break;
        case 2: // Weekly
            mask |= (weekMask & 0x000000FF) >>> 0;
            break;
        case 3: // Monthly
            mask |= (dayMask & 0x000000FF) >>> 0;
            break;
        case 4: // Yearly
            mask |= ((monthMask << 8) & 0x0000FF00) >>> 0;
            mask |= (dayMask & 0x000000FF) >>> 0;
            break;
    }

    return mask >>> 0;
}

module.exports = {
    addSite,
    renameSite,
    deleteSite,
    registerControlUnit,
    gearControlUnit,
    configureControlUnit,
    addDevice,
    updateDeviceGPS,
    addGadget,
    renameGadget,
    addVariable,
    updateVariable,
    activateSite,
    deactivateSite,
    terminateSite,
    deactivateDevice,
    activateDevice,
    terminateDevice,
    getUserSites,
    getSiteInfo,
    getDeviceInfo
};