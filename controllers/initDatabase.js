const ControlUnits = require('../models/controlUnits');
const Devices = require('../models/devices');
const Users = require('../models/users');
const Variables = require('../models/variables');
const DataLoggers = require('../models/dataLoggers');

// Fixed values taken from the requirements document
const TARGET_USER_ID = '69d0233fc97dd56c11bd381b';
const TARGET_SITE_ID = 'b561b47f-0060-4dd6-8438-36e653a59805';

/**
 * Re-points the test data to the newly created service-provider account.
 *
 * Expected body:
 * {
 *   "product1": { "serialNumber": "...", "deviceId": "...", "thingId": "...", "variables": [{...}, ...] },
 *   "product2": { "serialNumber": "...", "deviceId": "...", "thingId": "...", "variables": [{...}, ...] }
 * }
 */
const initDatabase = async (req, res) => {
    try {
        const bodyData = await req.body;

        // ---------------------------------------------------------------
        // 0. Validate the input and make sure all source records exist
        //    (nothing is modified until everything checks out)
        // ---------------------------------------------------------------
        const products = Object.values(bodyData || {});
        if (products.length === 0) {
            return res.status(400).json({
                status: 'failed',
                message: {info: 'Request body must contain at least one product.'}
            });
        }

        for (const p of products) {
            if (!p || !p.serialNumber || !p.deviceId || !p.thingId || !Array.isArray(p.variables)) {
                return res.status(400).json({
                    status: 'failed',
                    message: {info: 'Each product requires serialNumber, deviceId, thingId and a variables array.'}
                });
            }
        }

        const existingDevices = {};   // serialNumber -> original device record
        for (const p of products) {
            const controlUnit = await ControlUnits.findById(p.serialNumber).lean();
            if (!controlUnit) {
                return res.status(404).json({
                    status: 'failed',
                    message: {info: `No control unit found with _id ${p.serialNumber}.`}
                });
            }
            const device = await Devices.findOne({controlUnitId: p.serialNumber}).lean();
            if (!device) {
                return res.status(404).json({
                    status: 'failed',
                    message: {info: `No device found with controlUnitId ${p.serialNumber}.`}
                });
            }
            existingDevices[p.serialNumber] = device;
        }

        // ---------------------------------------------------------------
        // 1. control_units: update deviceId
        // 2. devices: clone with new _id / thingId, insert, then delete old
        //    + keep the old -> new deviceId / thingId mapping in memory
        // ---------------------------------------------------------------
        const deviceMappings = [];    // {serialNumber, oldDeviceId, newDeviceId, oldThingId, newThingId}

        for (const p of products) {
            await ControlUnits.updateOne(
                {_id: p.serialNumber},
                {$set: {deviceId: p.deviceId}}
            );

            const oldDevice = existingDevices[p.serialNumber];
            deviceMappings.push({
                serialNumber: p.serialNumber,
                oldDeviceId: oldDevice._id,
                newDeviceId: p.deviceId,
                oldThingId: oldDevice.thingId,
                newThingId: p.thingId,
            });

            if (oldDevice._id === p.deviceId) {
                // Already uses the new _id (e.g. script re-run): only refresh thingId
                await Devices.updateOne({_id: oldDevice._id}, {$set: {thingId: p.thingId}});
            } else {
                const clonedDevice = {...oldDevice, _id: p.deviceId, thingId: p.thingId};
                await Devices.create(clonedDevice);               // insert the clone first...
                await Devices.deleteOne({_id: oldDevice._id});    // ...then delete the original
            }
        }

        // ---------------------------------------------------------------
        // 3. users: update gadgets' deviceId inside the target site
        //    (updateOne with arrayFilters, so the password pre-save hook never runs)
        // ---------------------------------------------------------------
        for (const p of products) {
            await Users.updateOne(
                {_id: TARGET_USER_ID},
                {$set: {'sites.$[site].gadgets.$[gadget].deviceId': p.deviceId}},
                {
                    arrayFilters: [
                        {'site.id': TARGET_SITE_ID},
                        {'gadget.serialNumber': p.serialNumber}
                    ]
                }
            );
        }

        // ---------------------------------------------------------------
        // 4. variables: clone each record, update deviceId / thingId from the
        //    device mapping, look up the new variable id from the provided
        //    lists, insert the clone, then delete the original
        //    + keep the old -> new variableId mapping in memory
        // ---------------------------------------------------------------
        const deviceMapByOldId = new Map(deviceMappings.map(m => [m.oldDeviceId, m]));
        const allProvidedVariables = products.flatMap(p => p.variables);

        const variableMappings = [];  // {oldVariableId, newVariableId, oldDeviceId, newDeviceId}
        const skippedVariables = [];

        const existingVariables = await Variables.find({}).lean();

        for (const oldVariable of existingVariables) {
            const deviceMapping = deviceMapByOldId.get(oldVariable.deviceId);
            if (!deviceMapping) {
                skippedVariables.push({_id: oldVariable._id, reason: 'deviceId not part of this update'});
                continue;
            }

            // first parameter: variable name, second parameter: serial number
            const variableName = oldVariable.name;
            const serialNumber = deviceMapping.serialNumber;

            const target = allProvidedVariables.find(v =>
                (v.name ?? v.variable_name) === variableName &&
                typeof v.thing_name === 'string' &&
                v.thing_name.includes(serialNumber)
            );

            if (!target || !target.id) {
                skippedVariables.push({_id: oldVariable._id, reason: `no match for "${variableName}" / ${serialNumber}`});
                continue;
            }

            variableMappings.push({
                oldVariableId: oldVariable._id,
                newVariableId: target.id,
                oldDeviceId: deviceMapping.oldDeviceId,
                newDeviceId: deviceMapping.newDeviceId,
            });

            if (oldVariable._id === target.id) {
                await Variables.updateOne(
                    {_id: oldVariable._id},
                    {$set: {deviceId: deviceMapping.newDeviceId, thingId: deviceMapping.newThingId}}
                );
            } else {
                const clonedVariable = {
                    ...oldVariable,
                    _id: target.id,
                    deviceId: deviceMapping.newDeviceId,
                    thingId: deviceMapping.newThingId,
                };
                await Variables.create(clonedVariable);               // insert the clone first...
                await Variables.deleteOne({_id: oldVariable._id});    // ...then delete the original
            }
        }

        // ---------------------------------------------------------------
        // 5. dataLoggers: update variableId and deviceId on all records
        // ---------------------------------------------------------------
        let dataLoggersUpdated = 0;

        for (const m of variableMappings) {
            const result = await DataLoggers.updateMany(
                {variableId: m.oldVariableId},
                {$set: {variableId: m.newVariableId, deviceId: m.newDeviceId}}
            );
            dataLoggersUpdated += result.modifiedCount;
        }

        // Records whose variableId wasn't remapped but still carry an old deviceId
        for (const m of deviceMappings) {
            const result = await DataLoggers.updateMany(
                {deviceId: m.oldDeviceId},
                {$set: {deviceId: m.newDeviceId}}
            );
            dataLoggersUpdated += result.modifiedCount;
        }

        res.status(200).json({
            status: 'success',
            summary: {
                controlUnitsUpdated: products.length,
                devicesReplaced: deviceMappings.length,
                variablesReplaced: variableMappings.length,
                variablesSkipped: skippedVariables,
                dataLoggersUpdated,
            }
        });
    }
    catch (err) {
        res.status(500)
            .json({
                status: "failed",
                error: req.i18n.t('general.internalError'),
                message: {
                    info: (process.env.ERROR_SHOW_DETAILS) === 'true' ? err.toString() : undefined
                }
            })
    }
}

module.exports = { initDatabase };