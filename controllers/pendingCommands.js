const Variables = require('../models/variables');
const {emitVariableUpdate} = require('./iotCloudEvents');

// A solenoid1State command sent from the app while solenoid1Manual is on reaches the webhook twice: the app's own write, then the
// device's echo once the valve really moved. Only the echo proves the valve moved, so it is the one that must be saved in the Data
// Logger. The backend is the only one that knows a command came from the app (the webhook's created_by is the device for every
// event), so updateVariable records the command here BEFORE sending it, and the webhook (see system.js) uses that record to tell
// the app's copy from the device's echo. If no echo arrives in time (device off / in deep sleep), the command is cancelled:
// nothing is saved, and the app and the Arduino Cloud property both go back to the previous value.
const PENDING_WINDOW_MS = Number(process.env.PENDING_WINDOW_MS) || 10000;   // how long to wait for the device's echo
const PENDING_STALE_MS = PENDING_WINDOW_MS + 5000;                          // a record older than this is ignored (e.g. lost in a restart)
const REVERT_GUARD_MS = 30000;                                              // the cancel's own webhook event is ignored for this long

const sameValue = (a, b) => String(a) === String(b);

const startPendingCommand = async (variable, value) => {
    const sentAt = new Date();
    await Variables.updateOne(
        {_id: variable._id},
        {$set: {pending: {value, previous: variable.value, sentAt, seen: 0}}, $unset: {revert: 1}}
    );
    return sentAt;
}

const cancelPendingCommand = async (variableId) => {
    await Variables.updateOne({_id: variableId}, {$unset: {pending: 1}});
}

// Called once the command has been accepted by the Arduino Cloud. `revertCloud` publishes the previous value back to the cloud.
const watchPendingCommand = (variable, sentAt, revertCloud) => {
    const timer = setTimeout(async () => {
        try {
            // The device's echo clears the record, so if it is still here (same command) no echo arrived
            const current = await Variables.findOne({_id: variable._id, 'pending.sentAt': sentAt}, {pending: 1}).lean();
            if (!current) return;
            const {previous, seen} = current.pending;

            await Variables.updateOne({_id: variable._id}, {$unset: {pending: 1}});

            if (seen === 0) {
                // Not even the app's own copy reached the webhook, so there is nothing to judge by: leave everything as it is
                console.log(`Pending ${variable.name} command: no webhook event at all, left unchanged`);
                return;
            }

            await Variables.updateOne(
                {_id: variable._id},
                {$set: {revert: {value: previous, until: new Date(Date.now() + REVERT_GUARD_MS)}, value: previous, updatedAt: new Date()}}
            );
            emitVariableUpdate({
                variableId: variable._id,
                variableName: variable.name,
                value: previous,
                updatedAt: new Date(),
                deviceId: variable.deviceId
            });
            await revertCloud();
        }
        catch (err) {
            console.log('Error while cancelling an unconfirmed command');
            console.log(err.toString());
        }
    }, PENDING_WINDOW_MS);
    if (timer.unref) timer.unref();
}

// Used by the webhook for every solenoid1State event: 'drop' = ignore it, 'save' = process it normally.
const classifyStateEvent = async (variable) => {
    const record = await Variables.findOne({_id: variable.id}, {pending: 1, revert: 1}).lean();
    if (!record) return 'save';

    // The event produced by cancelling a command (the backend published the previous value back)
    if (record.revert && Date.now() < new Date(record.revert.until).getTime() && sameValue(record.revert.value, variable.value)) {
        return 'drop';
    }

    const pending = record.pending;
    if (!pending || !sameValue(pending.value, variable.value) || Date.now() - new Date(pending.sentAt).getTime() > PENDING_STALE_MS) {
        return 'save';      // no command from the app is waiting: the device did it by itself (schedule, closing on manual switch, boot...)
    }

    if (pending.seen === 0) {
        await Variables.updateOne({_id: variable.id}, {$set: {'pending.seen': 1}});
        return 'drop';      // the app's own write
    }

    await Variables.updateOne({_id: variable.id}, {$unset: {pending: 1}});
    return 'save';          // the device's echo
}

module.exports = {startPendingCommand, cancelPendingCommand, watchPendingCommand, classifyStateEvent}
