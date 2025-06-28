const debug = require('debug');
const log = debug('app-database:info');
const errorLog = debug('app-database:error');
const mongoose = require('mongoose');
require('dotenv').config();

const  dbName = 'Agri_Botz'
const connectionString =
    `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_PASSWORD}@cluster0.l6lituu.mongodb.net/${dbName}
    ?retryWrites=true&w=majority`

const connectDB = async () => {
    try {
        await mongoose.connect(connectionString);
        log('Database connected');
    } catch (error) {
        errorLog(error.message);
        process.exit(1);
    }
}

module.exports = connectDB


