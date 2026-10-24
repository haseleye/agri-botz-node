const DataLoggers = require('../models/dataLoggers');
const {VARIABLE_CATEGORIES} = require('./iotCloud');
const Variables = require('../models/variables');
const {emitVariableUpdate} = require('./iotCloudEvents');
const {registerHeartbeat, trackOnlineState, startHeartbeatWatchdog} = require('./heartbeat');

startHeartbeatWatchdog();

const arduinoWebhook = async (req, res) => {
    console.log('=== ARDUINO WEBHOOK HIT ===');
    try {
        const data = await req.body;
        console.log(data);
        const deviceId = data.device_id;
        const eventId = data.event_id;
        const dataLoggerList = [];
        let dataLogger = {};
        const dataUpdateList = [];
        let dataUpdate = {};
        const heartbeatList = [];

        // const dataLoggers = await DataLoggers.find({deviceId}, {variableId: 1, eventId: 1, value: 1});
        data.values.map(async (variable) => {
            // The heartBeat is only used to tell that the device is alive, it's neither saved nor sent to the app
            if (variable.name === 'heartBeat') {
                heartbeatList.push(variable);
                return;
            }

            if (VARIABLE_CATEGORIES.SENSORS.includes(variable.name) || VARIABLE_CATEGORIES.IRRIGATION.includes(variable.name)
                || VARIABLE_CATEGORIES.VALVES.includes(variable.name) || ['isOnline'].includes(variable.name)) {
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

            if (update.variableName === 'isOnline') {
                trackOnlineState(deviceId, update.value, update.variableId);
            }

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

        for (const heartbeat of heartbeatList) {
            await registerHeartbeat(deviceId, heartbeat.updated_at);
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