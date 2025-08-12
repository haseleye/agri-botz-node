const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const dataLoggerSchema = new Schema({
    variableId: String,
    variableName: String,
    deviceId: {
        type: String,
        required: true
    },
    eventId: {
        type: String,
        required: true
    },
    value: Object,
    updatedAt: String,
    response: Object
});

dataLoggerSchema.index({deviceId: 1, eventId: 1}, {unique: true});
const dataLoggerModel = model('data_logger', dataLoggerSchema);

module.exports = dataLoggerModel;