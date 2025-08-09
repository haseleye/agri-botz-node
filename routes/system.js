const express = require('express');
const router = express.Router();
const System = require('../controllers/system');

router.post('/update-person-images-cb', System.updatePersonImagesCB);

router.post('/update-person-images-callback', System.updatePersonImagesCallback);

router.post('/arduino-webhook', System.arduinoWebhook);
router.all('/arduino-webhook', (req, res) => {
    res.status(405).send(`Method Not Allowed: This endpoint only accepts POST requests.`);
})

module.exports = router;