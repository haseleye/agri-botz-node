const express = require('express');
const router = express.Router();
const iotCloud = require('../controllers/iotCloud')
const {authorize} = require("../middleware/auth");

router.post('/add-site', authorize('Api', ['User', 'Admin']), iotCloud.addSite);

router.post('/rename-site', authorize('Api', ['User', 'Admin']), iotCloud.renameSite);

router.post('/delete-site', authorize('Api', ['User', 'Admin']), iotCloud.deleteSite);

router.post('/register-control-unit', authorize('Api', ['Admin']), iotCloud.registerControlUnit);

router.post('/gear-control-unit', authorize('Api', ['Admin']), iotCloud.gearControlUnit);

router.post('/configure-control-unit', authorize('Api', ['User', 'Admin']), iotCloud.configureControlUnit);

router.post('/add-device', authorize('Api', ['Admin']), iotCloud.addDevice);

router.post('/update-gadget-gps', authorize('Api', ['User']), iotCloud.updateGadgetGPS);

router.post('/add-gadget', authorize('Api', ['Admin']), iotCloud.addGadget);

router.post('/rename-gadget', authorize('Api', ['User']), iotCloud.renameGadget);

router.post('/add-variable', authorize('Api', ['Admin']), iotCloud.addVariable);

router.post('/update-variable', authorize('Api', ['User']), iotCloud.updateVariable);

router.post('/activate-site', authorize('Api', ['Admin']), iotCloud.activateSite);

router.post('/deactivate-site', authorize('Api', ['Admin']), iotCloud.deactivateSite);

router.post('/terminate-site', authorize('Api', ['Admin']), iotCloud.terminateSite);

router.post('/activate-device', authorize('Api', ['Admin']), iotCloud.activateDevice);

router.post('/deactivate-device', authorize('Api', ['Admin']), iotCloud.deactivateDevice);

router.post('/terminate-device', authorize('Api', ['Admin']), iotCloud.terminateDevice);

router.post('/get-user-sites', authorize('Access', ['User', 'Admin']), iotCloud.getUserSites);

router.post('/get-site-info', authorize('Api', ['User', 'Admin']), iotCloud.getSiteInfo);

router.post('/get-gadget-info', authorize('Api', ['User', 'Admin']), iotCloud.getGadgetInfo);

router.post('/get-device-info', authorize('Api', ['Admin']), iotCloud.getDeviceInfo);

module.exports = router;