const DataLoggers = require('../models/dataLoggers');
const {VARIABLE_CATEGORIES} = require('./iotCloud');
const Variables = require('../models/variables');
const {emitVariableUpdate} = require('./iotCloudEvents');

const arduinoWebhook = async (req, res) => {
    try {
        const data = await req.body;
        const deviceId = data.device_id;
        const eventId = data.event_id;
        const dataLoggerList = [];
        let dataLogger = {};
        const dataUpdateList = [];
        let dataUpdate = {};

        // const dataLoggers = await DataLoggers.find({deviceId}, {variableId: 1, eventId: 1, value: 1});
        data.values.map(async (variable) => {
            if (VARIABLE_CATEGORIES.SENSORS.includes(variable.name) || VARIABLE_CATEGORIES.IRRIGATION.includes(variable.name)
                || ['isOnline'].includes(variable.name)) {
                dataLogger.variableId = variable.id;
                dataLogger.variableName = variable.name;
                dataLogger.deviceId = deviceId;
                dataLogger.eventId = eventId;
                dataLogger.value = variable.value;
                dataLogger.updatedAt = variable.updated_at;
                dataLoggerList.push(dataLogger);
                dataLogger = {};

                dataUpdate.variableId = variable.id;
                dataUpdate.variableName = variable.name;
                dataUpdate.value = variable.value
                dataUpdate.updatedAt = variable.updated_at;
                dataUpdateList.push(dataUpdate);
                dataUpdate = {};
            }
        });

        await DataLoggers.create(dataLoggerList);

        for (const update of dataUpdateList) {
            await Variables.updateOne(
                {_id: update.variableId},
                {value: update.value, updatedAt: update.updatedAt}
            );

            if (['isOnline', 'solenoid1State'].includes(update.variableName)) {
                emitVariableUpdate({
                    variableId: update.variableId,
                    variableName: update.variableName,
                    value: update.value,
                    updatedAt: update.updatedAt,
                    deviceId
                });
            }
        }

    }
    catch (err) {
        console.log('Error while processing Arduino Webhook data');
        console.log(err.toString());
    }
    finally {
        res.status(200).send('Data received successfully!');
    }
}

module.exports = {arduinoWebhook}