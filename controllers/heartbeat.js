const debug = require('debug');
const log = debug('app-heartbeat:info');
const errorLog = debug('app-heartbeat:error');

const Variables = require('../models/variables');
const {emitVariableUpdate} = require('./iotCloudEvents');

// AquaSense sends a "heartBeat" every 30 seconds, so 75 seconds means two missed beats plus a 15 seconds grace
const HEARTBEAT_TIMEOUT_MS = 75000;
const SWEEP_INTERVAL_MS = 15000;

// deviceId -> {lastSeenAt: epoch ms (server receive time), isOnline: boolean|null, variableId: string|null}
const devicesState = new Map();

let isSweeping = false;
let sweepTimer = null;

const getDeviceState = (deviceId) => {
    let state = devicesState.get(deviceId);

    if (!state) {
        state = {lastSeenAt: 0, isOnline: null, variableId: null};
        devicesState.set(deviceId, state);
    }

    return state;
}

const setOnlineState = async (deviceId, state, isOnline, updatedAt) => {
    const variable = await Variables.findOneAndUpdate(
        {deviceId, name: 'isOnline'},
        {value: isOnline, updatedAt},
        {projection: {_id: 1}}
    );

    if (!variable) return false;

    state.variableId = variable._id.toString();
    state.isOnline = isOnline;

    emitVariableUpdate({
        variableId: state.variableId,
        variableName: 'isOnline',
        value: isOnline,
        updatedAt: updatedAt.toISOString(),
        deviceId
    });

    return true;
}

/**
 * Called by the Arduino Webhook for every "heartBeat" received.
 * Records the device as alive, and brings it back online if it was marked offline.
 */
const registerHeartbeat = async (deviceId, heartbeatUpdatedAt) => {
    try {
        const state = getDeviceState(deviceId);
        state.lastSeenAt = Date.now();

        if (state.isOnline === true) return;

        // First heartbeat since the server started, or the device is currently offline
        const onlineVariable = await Variables.findOne({deviceId, name: 'isOnline'}, {value: 1, updatedAt: 1});
        if (!onlineVariable) return;

        state.variableId = onlineVariable._id.toString();

        if (onlineVariable.value === true) {
            state.isOnline = true;
            return;
        }

        // Ignore a heartbeat that is older than the offline status
        const heartbeatAt = new Date(heartbeatUpdatedAt);
        const updatedAt = isNaN(heartbeatAt.getTime()) ? new Date() : heartbeatAt;
        if (onlineVariable.updatedAt && onlineVariable.updatedAt.getTime() >= updatedAt.getTime()) {
            state.isOnline = false;
            return;
        }

        await setOnlineState(deviceId, state, true, updatedAt);
        log(`Device ${deviceId} is back online (heartbeat received)`);
    }
    catch (err) {
        errorLog(err.toString());
    }
}

/**
 * Called by the Arduino Webhook whenever "isOnline" is received, to keep the tracked state in sync
 */
const trackOnlineState = (deviceId, isOnline, variableId) => {
    const state = getDeviceState(deviceId);

    state.isOnline = isOnline === true;
    state.variableId = variableId;

    // A device that just connected gets a fresh timeout window
    if (state.isOnline) {
        state.lastSeenAt = Date.now();
    }
}

const sweepDevices = async () => {
    if (isSweeping) return;
    isSweeping = true;

    try {
        const now = Date.now();

        for (const [deviceId, state] of devicesState) {
            // Only devices that have sent at least one heartbeat are watched
            if (state.isOnline !== true || state.lastSeenAt === 0) continue;
            if (now - state.lastSeenAt <= HEARTBEAT_TIMEOUT_MS) continue;

            try {
                // The device was last seen at the last heartbeat, so the offline time starts from there
                const isUpdated = await setOnlineState(deviceId, state, false, new Date(state.lastSeenAt));
                if (isUpdated) {
                    log(`Device ${deviceId} marked offline (no heartbeat for ${Math.round((now - state.lastSeenAt) / 1000)} seconds)`);
                }
            }
            catch (err) {
                errorLog(err.toString());
            }
        }
    }
    finally {
        isSweeping = false;
    }
}

const startHeartbeatWatchdog = () => {
    if (sweepTimer) return;

    sweepTimer = setInterval(sweepDevices, SWEEP_INTERVAL_MS);
    log('Heartbeat watchdog started');
}

module.exports = {
    registerHeartbeat,
    trackOnlineState,
    startHeartbeatWatchdog
}
