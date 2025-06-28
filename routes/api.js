const express = require('express');
const router = express.Router();
const api = require('../controllers/api');
const {listCountries} = require("../controllers/countries");
const multipartParser = require('../middleware/multipartParser');
const {integer} = require("twilio/lib/base/deserialize");
const Process = require("process");

const maxFilesCount = integer(process.env.FR_MAX_UPLOADED_IMAGES);
const fileTypesList = Process.env.FR_FILE_TYPE.split(',');
const options1 = {maxFileSize: 1, maxFilesCount, fileTypesList};
const inputField1 = 'images';
const options2 = {maxFileSize: 3, maxFilesCount: 1, fileTypesList};
const inputField2 = 'image';

/** add a new person to the user's account, each user must have a unique ID */
router.post('/add-person', api.addPerson);

/** Send the images to AWS S3 for storing and then to Core for encoding. Person's data is updated through a callback function */
router.post('/update-person-images', multipartParser(options1, inputField1), api.updatePersonImages);

/** Send the image to the Core to detect and recognize the faces, with option to generate an output image */
router.post('/recognize-image', multipartParser(options2, inputField2), api.recognizeImage);

/** Delete the image's encoding from the Core, then delete the image from AWS S3, then update person's data */
router.post('/delete-person-image', api.deletePersonImage);

/** Delete all person's images' encoding from the Core, then delete all person's images from AWS S3, then remove the person */
router.post('/delete-person', api.deletePerson);

module.exports = router;
