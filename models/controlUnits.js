const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const controlUnitSchema = new Schema({
    _id: String,
    attributes: Object,
    firmwareVersion: String,
    sensorsList: Array,
    deviceId: String,
    config: Object,
    isConfigured: {
        type: 'boolean',
        default: false,
    }
})

const controlUnitModel = model('control_unit', controlUnitSchema);

module.exports = controlUnitModel;