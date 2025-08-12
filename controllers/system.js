const debug = require('debug');
const errorLog = debug('app-system:error');
const User = require("./users");
const DataLoggers = require('../models/dataLoggers');
const {GADGET_TYPES} = require('../models/users');
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
        const deviceId = data.device_id;
        const eventId = data.event_id;
        const dataLoggerList = [];
        const dataLogger = {};

        const dataLoggers = await DataLoggers.find({deviceId}, {variableId: 1, eventId: 1, value: 1});
        data.values.map((variable) => {
            const variableId = variable.id;
            const foundLogger = dataLoggers.find((logger) => logger.variableId === variableId && logger.eventId === eventId);
            if (foundLogger === undefined) {
                dataLogger.variableName = variable.name;
                dataLogger.variableId = variableId;
                dataLogger.deviceId = deviceId;
                dataLogger.eventId = eventId;
                dataLogger.value = variable.value;
                const index = GADGET_TYPES[1].indexOf('variable.name');
                dataLogger.type = index === -1 ? "NONE" : GADGET_TYPES[0][index];
                dataLogger.updatedAt = variable.updated_at;
                dataLogger.response = dataLoggers;
                dataLoggerList.push(dataLogger);
            }
        })

        await DataLoggers.create(dataLoggerList);
        // await Variables.updateOne({_id: '57615007-4dab-41e4-a794-ff0470d2391f'}, {response: data});
    }
    catch (err) {
        console.log('Error while processing Arduino Webhook data');
        console.log(err.toString());
    }
    finally {
        res.status(200).send('Data received successfully!');
    }
}

module.exports = {updatePersonImagesCB, updatePersonImagesCallback, arduinoWebhook}