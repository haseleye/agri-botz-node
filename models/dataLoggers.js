const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const dataLoggerSchema = new Schema({
    variableId: String,
    variableName: String,
    deviceId: String,
    value: Object,
    updatedAt: String,
    response: Object
});

const dataLoggerModel = model('data_logger', dataLoggerSchema);

module.exports = dataLoggerModel;