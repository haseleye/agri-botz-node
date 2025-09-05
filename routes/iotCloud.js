const express = require('express');
const router = express.Router();
const iotCloud = require('../controllers/iotCloud')
const {authorize} = require("../middleware/auth");

router.post('/add-site', authorize('Access', ['User', 'Admin']), iotCloud.addSite);

router.post('/rename-site', authorize('Access', ['User', 'Admin']), iotCloud.renameSite);

router.post('/delete-site', authorize('Access', ['User', 'Admin']), iotCloud.deleteSite);

router.post('/register-control-unit', authorize('Access', ['Admin']), iotCloud.registerControlUnit);

router.post('/gear-control-unit', authorize('Access', ['Admin']), iotCloud.gearControlUnit);

router.post('/configure-control-unit', authorize('Access', ['User', 'Admin']), iotCloud.configureControlUnit);

router.post('/add-device', authorize('Access', ['Admin']), iotCloud.addDevice);

router.post('/update-gadget-gps', authorize('Access', ['User']), iotCloud.updateGadgetGPS);

router.post('/add-gadget', authorize('Access', ['Admin']), iotCloud.addGadget);

router.post('/rename-gadget', authorize('Access', ['User']), iotCloud.renameGadget);

router.post('/add-variable', authorize('Access', ['Admin']), iotCloud.addVariable);

router.post('/update-variable', authorize('Access', ['User']), iotCloud.updateVariable);

router.post('/activate-site', authorize('Access', ['Admin']), iotCloud.activateSite);

router.post('/deactivate-site', authorize('Access', ['Admin']), iotCloud.deactivateSite);

router.post('/terminate-site', authorize('Access', ['Admin']), iotCloud.terminateSite);

router.post('/activate-device', authorize('Access', ['Admin']), iotCloud.activateDevice);

router.post('/deactivate-device', authorize('Access', ['Admin']), iotCloud.deactivateDevice);

router.post('/terminate-device', authorize('Access', ['Admin']), iotCloud.terminateDevice);

router.post('/get-user-sites', authorize('Access', ['User', 'Admin']), iotCloud.getUserSites);

router.post('/get-site-info', authorize('Access', ['User', 'Admin']), iotCloud.getSiteInfo);

router.post('/get-gadget-info', authorize('Access', ['User', 'Admin']), iotCloud.getGadgetInfo);

router.post('/get-device-info', authorize('Access', ['Admin']), iotCloud.getDeviceInfo);

module.exports = router;