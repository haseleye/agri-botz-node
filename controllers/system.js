const DataLoggers = require('../models/dataLoggers');
const {VARIABLE_CATEGORIES} = require('./iotCloud');
const Variables = require('../models/variables');
const {emitVariableUpdate} = require('./iotCloudEvents');
const {registerHeartbeat, trackOnlineState, startHeartbeatWatchdog} = require('./heartbeat');
const {classifyStateEvent} = require('./pendingCommands');

startHeartbeatWatchdog();

// After every boot the ESP32 re-publishes ALL its properties once (an Arduino IoT Cloud library behaviour), so the sensor
// values also arrive at wake-up, unchanged. A real reading always arrives in the SAME webhook call as the state that
// finishes it (npkState=false for the NPK values, dhtState=false for the DHT11 values), so sensor values are saved only then.
const NPK_VARIABLES = ["soilN", "soilP", "soilK", "soilPh", "soilEc", "soilTemp", "soilMoisture"];
const DHT_VARIABLES = ["airTemp", "airHumidity"];
const isStateFalse = (values, name) => values.some((v) => v.name === name && (v.value === false || v.value === 'false'));

const processWebhook = async (req, res) => {
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

        // The valve/manual states are also re-published at boot, and a change made from the app arrives twice (the app's write,
        // then the device's echo about 1 s later, sometimes in the same call). A real change always differs from the last saved
        // value, so a value equal to the last one saved in the Data Logger (or earlier in this same call) is a repeat and is ignored.
        const repeatedStates = new Set();
        const lastValueInCall = new Map();
        for (const variable of data.values) {
            if (VARIABLE_CATEGORIES.IRRIGATION.includes(variable.name)) {
                // A valve command from the app (manual mode) is waiting for the device's echo: the app's own copy is ignored, the echo
                // is saved (see pendingCommands.js). Dropped events don't take part in the repeat check below.
                if (variable.name === 'solenoid1State' && await classifyStateEvent(variable) === 'drop') {
                    repeatedStates.add(variable);
                    continue;
                }
                let lastValue;
                if (lastValueInCall.has(variable.id)) {
                    lastValue = lastValueInCall.get(variable.id);
                }
                else {
                    const last = await DataLoggers.findOne({variableId: variable.id}, {value: 1}).sort({updatedAt: -1}).lean();
                    lastValue = last ? last.value : undefined;
                }
                if (lastValue !== undefined && String(lastValue) === String(variable.value)) repeatedStates.add(variable);
                lastValueInCall.set(variable.id, variable.value);
            }
        }

        data.values.map(async (variable) => {
            // The heartBeat is only used to tell that the device is alive, it's neither saved nor sent to the app
            if (variable.name === 'heartBeat') {
                heartbeatList.push(variable);
                return;
            }

            // Sensor values that are not part of a finished reading (e.g. the boot snapshot) are neither saved nor updated
            if (NPK_VARIABLES.includes(variable.name) && !npkReadingFinished) return;
            if (DHT_VARIABLES.includes(variable.name) && !dhtReadingFinished) return;

            if (repeatedStates.has(variable)) return;

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

// Webhook calls are processed one at a time, so the "same as last saved value" check cannot race with the insert of a call
// that arrived a few milliseconds earlier (the app's write and the device's echo can reach the backend almost together).
let webhookQueue = Promise.resolve();
const arduinoWebhook = (req, res) => {
    const run = webhookQueue.then(() => processWebhook(req, res));
    webhookQueue = run.catch(() => {});
    return run;
}

module.exports = {arduinoWebhook}