const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const variableSchema = new Schema({
    _id: String,
    name: String,
    type: {
        type: String,
        enum: {
            values: ['integer', 'float', 'string', 'boolean', 'schedule']
        }
    },
    category: String,
    value: Object,
    deviceId: String,
    thingId: String,
    userID: String,
    updatedAt: {
        type: Date,
        default: new Date()
    },
})

const variableModel = model('variable', variableSchema);

module.exports = variableModel;