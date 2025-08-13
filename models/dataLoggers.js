const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const dataLoggerSchema = new Schema({
    variableId: String,
    variableName: String,
    deviceId: String,
    eventId: String,
    value: Object,
    type: String,
    updatedAt: Date,
});

dataLoggerSchema.index({variableId: 1, eventId: 1}, {unique: true});
const dataLoggerModel = model('data_logger', dataLoggerSchema);

module.exports = dataLoggerModel;