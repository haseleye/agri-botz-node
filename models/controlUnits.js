const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const controlUnitSchema = new Schema({
    _id: String,
    attributes: Object,
    firmwareVersion: String,
    sensorsList: Array,
    deviceId: String,
    config: {
        solenoid1Pin1: Number,
        solenoid1Pin2: Number,
        solenoid2Pin1: Number,
        solenoid2Pin2: Number,
        relay1Pin: Number,
        relay2Pin: Number,
        npkRs485PowerPin: Number,
        dhtPowerPin: Number,
        rx1Pin: Number,
        tx1Pin: Number,
        dhtPin: Number
    },
    isConfigured: {
        type: 'boolean',
        default: false,
    }
})

const controlUnitModel = model('control_unit', controlUnitSchema);

module.exports = controlUnitModel;