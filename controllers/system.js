const debug = require('debug');
const errorLog = debug('app-system:error');
const User = require("./users");
const Variables = require('../models/variables');

const updatePersonImagesCB = async (req, res) => {
    try {
        const {userId, personId, index, encodingIndex} = await req.body;
        await User.getPersonData(userId, personId)
            .then(async (person) => {
                const imagesList = person.images;
                imagesList[index] = encodingIndex;
                await User.updatePersonData(userId, personId, {images: imagesList})
                    .then(() => {
                        return res.status(200).json({
                            status: "success",
                            error: "",
                            message: {}
                        })
                    })
                    .catch((err) => {
                        throw new Error(err.toString());
                    })
            })
            .catch((err) => {
                throw new Error(err.toString());
            })
    }
    catch (err) {
        errorLog(err.toString());
        res.status(500).json({
            status: "Failed",
            error: err.toString(),
            message: {}
        })
    }
}

const updatePersonImagesCallback = async (req, res) => {
    try {
        const {status, error, fileName, userId, person: {id, firstName, lastName}} = await req.body;

        console.log(`Status: ${status}`)
        console.log(`Error: ${error}`)
        console.log(`File Name: ${fileName}`)
        console.log(`User ID: ${userId}`)
        console.log(`Person ID: ${id}`)
        console.log(`First Name: ${firstName}`)
        console.log(`Last Name: ${lastName}`)
    }
    catch (err) {
        console.log('Error while calling callback function')
    }
}

const arduinoWebhook = async (req, res) => {
    try {
        const data = await req.body;
        console.log('Received data from Arduino Webhook:')
        console.log(data);
        await Variables.updateOne({_id: '57c41245-fdad-4b65-b2fb-3f7432c729a4'}, {value: true});
    }
    catch (err) {
        console.log('Error while calling Arduino Webhook');
        console.log(err.toString());
    }
    finally {
        res.status(200).send('Data received successfully!');
    }
}

module.exports = {updatePersonImagesCB, updatePersonImagesCallback, arduinoWebhook}