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
    pending: Object,    // solenoid1State only: the app's command waiting for the device's echo (see controllers/pendingCommands.js)
    revert: Object,     // solenoid1State only: marks the webhook event caused by cancelling an unconfirmed command
    updatedAt: {
        type: Date,
        default: new Date()
    },
})

const variableModel = model('variable', variableSchema);

module.exports = variableModel;