const express = require("express");
const router = express.Router();
const {initDatabase} = require('../controllers/initDatabase');
const {authorize} = require("../middleware/auth");

const initDatabaseRoles = ['Admin'];
router.post('/init-database/', authorize('Access', initDatabaseRoles), initDatabase);

module.exports = router;