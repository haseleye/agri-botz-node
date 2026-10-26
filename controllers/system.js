const DataLoggers = require('../models/dataLoggers');
const {VARIABLE_CATEGORIES} = require('./iotCloud');
const Variables = require('../models/variables');
const {emitVariableUpdate} = require('./iotCloudEvents');
const {registerHeartbeat, trackOnlineState, startHeartbeatWatchdog} = require('./heartbeat');

startHeartbeatWatchdog();

// After every boot the ESP32 re-publishes ALL its properties once (an Arduino IoT Cloud library behaviour), so the sensor
// values also arrive at wake-up, unchanged. A real reading always arrives in the SAME webhook call as the state that
// finishes it (npkState=false for the NPK values, dhtState=false for the DHT11 values), so sensor values are saved only then.
const NPK_VARIABLES = ["soilN", "soilP", "soilK", "soilPh", "soilEc", "soilTemp", "soilMoisture"];
const DHT_VARIABLES = ["airTemp", "airHumidity"];
const isStateFalse = (values, name) => values.some((v) => v.name === name && (v.value === false || v.value === 'false'));

const arduinoWebhook = async (req, res) => {
    console.log('=== ARDUINO WEBHOOK HIT ===');
    try {
        const data = await req.body;
        const deviceId = data.device_id;
        const eventId = data.event_id;
        const dataLoggerList = [];
        let dataLogger = {};
        const dataUpdateList = [];
        let dataUpdate = {};
        const heartbeatList = [];

        // const dataLoggers = await DataLoggers.find({deviceId}, {variableId: 1, eventId: 1, value: 1});
        const npkReadingFinished = isStateFalse(data.values, 'npkState');
        const dhtReadingFinished = isStateFalse(data.values, 'dhtState');

        data.values.map(async (variable) => {
            // The heartBeat is only used to tell that the device is alive, it's neither saved nor sent to the app
            if (variable.name === 'heartBeat') {
                heartbeatList.push(variable);
                return;
            }

            // Sensor values that are not part of a finished reading (e.g. the boot snapshot) are neither saved nor updated
            if (NPK_VARIABLES.includes(variable.name) && !npkReadingFinished) return;
            if (DHT_VARIABLES.includes(variable.name) && !dhtReadingFinished) return;

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