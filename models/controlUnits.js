const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const controlUnitSchema = new Schema({
    _id: String,
    attributes: Object,
    firmwareVersion: String,
    deviceId: String,
    config: {
        solenoid1Pin1: Number,
        solenoid1Pin2: Number,
        solenoid2Pin1: Number,
        solenoid2Pin2: Number,
    }
})

const controlUnitModel = model('control_unit', controlUnitSchema);

module.exports = controlUnitModel;