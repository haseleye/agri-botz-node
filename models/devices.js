const mongoose = require('mongoose');
const {Schema, model} = mongoose;

const deviceSchema = new Schema({
    _id: String,
    secretKey: String,
    userID: String,
    siteId: String,
    gps: {
        lat: Number,
        long: Number,
    },
    isCloudConnected: {
        type: Boolean,
        default: false
    },
    controlUnitId: String,
    isActive: {
        type: Boolean,
        default: false
    },
    isTerminated: {
        type: Boolean,
        default: false
    }
})

const deviceModel = model('device', deviceSchema);

module.exports = deviceModel;