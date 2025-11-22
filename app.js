const debug = require('debug');
const log = debug('app-server:info');
const errorLog = debug('app-server:error');
const createError = require('http-errors');
const connectDB = require('./db/connect');
const errorHandler = require('./middleware/server');
const {checkAppLang} = require('./middleware/languageChecker')
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const fs = require('fs');
const http = require('http');
const https = require('https');
const multer = require('multer');

const {i18next, i18nextMiddleware} = require('./controllers/localization');
const {authorize} = require('./middleware/auth');

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');
const plansRouter = require('./routes/plans')
const paymentsRouter = require('./routes/payments');
const iotCloudRouter = require('./routes/iotCloud');
const adminRouter = require('./routes/admin');
const apiRouter = require('./routes/api');
const sysRouter = require('./routes/system');
const {login} = require("./controllers/users");

const {getAccessToken, getSuppliers} = require('./controllers/fusion');

const app = express();

/** View engine setup */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(i18nextMiddleware.handle(i18next));
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Folder for storing attachments
const ATTACHMENTS_DIR = path.join(__dirname, 'attachments');

// Ensure folder exists
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR);
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ATTACHMENTS_DIR);
  },
  filename: function (req, file, cb) {
    // Save with original name
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

app.post('/aldar/getAttachment', async (req, res) => {
  try {
    const { fileName } = req.body;

    // Validate input
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({
        status: "error",
        message: "fileName is required in JSON payload"
      });
    }

    // Prevent directory traversal attacks
    const safeFileName = path.basename(fileName);

    const filePath = path.join(ATTACHMENTS_DIR, safeFileName);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        status: "error",
        message: "File not found"
      });
    }

    // Read file as Base64
    const fileData = fs.readFileSync(filePath, { encoding: 'base64' });

    return res.json({
      status: "success",
      fileName: safeFileName,
      fileSize: fs.statSync(filePath).size,
      fileData: fileData // Base64 encoded data
    });

  } catch (err) {
    console.error("Error in getAttachment:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      details: err.message
    });
  }
});

app.post('/aldar/uploadAttachment', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "No file uploaded"
      });
    }

    return res.json({
      status: "success",
      message: "File uploaded successfully",
      fileName: req.file.originalname,
      size: req.file.size
    });

  } catch (err) {
    console.error("Upload error:", err);

    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      details: err.message
    });
  }
});

app.use('/', indexRouter);
app.use('/system', sysRouter);
app.use(checkAppLang);
app.use('/users', usersRouter);
app.use('/plans', plansRouter);
app.use('/payments', paymentsRouter);
app.use('/api/iotCloud', iotCloudRouter);
app.use('/api', authorize('Api', ['User']));
app.use('/api', apiRouter);
app.use('/admin', authorize('Access', ['Admin']));
app.use('/admin', adminRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(errorHandler);

/** Get port from environment and store in Express */
const port = normalizePort(process.env.PORT || '3001');
app.set('port', port);

const sslInstalled = process.env.SECURITY_SSL_INSTALLED === 'True';
if (sslInstalled) {
  const certPath = '/etc/letsencrypt/live/dev.agribotz.com/';
  const options = {
    key: fs.readFileSync(path.join(certPath, 'privkey.pem')),
    cert: fs.readFileSync(path.join(certPath, 'cert.pem')),
    ca: [
      fs.readFileSync(path.join(certPath, 'chain.pem')),
      fs.readFileSync(path.join(certPath, 'fullchain.pem')),
    ]
  };
  const httpsServer = https.createServer(options, app);
  connectDB()
      .then(() => {
        httpsServer.listen(port, onListening).on('error', onError);
      });
}
else {
  const httpServer = http.createServer(app);
  connectDB()
      .then(() => {
        httpServer.listen(port, onListening).on('error', onError);
      });
}

/** Normalize a port into a number, string, or false */
function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/** Event listener for HTTP server "error" event */
function onError(error) {

  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
      ? 'Pipe ' + port
      : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      errorLog(`${bind} requires elevated privileges`)
      process.exit(1);
      break;
    case 'EADDRINUSE':
      errorLog(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/** Event listener for HTTP server "listening" event */
function onListening() {

  const bind = typeof port === 'string'
      ? 'pipe ' + port
      : 'port ' + port;
  log(`Listening on ${bind}`);
}

