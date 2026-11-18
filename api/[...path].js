'use strict';

// Express is cached by the serverless instance; MongoDB connections are reused.
const { createApp } = require('../backend/src/app');
module.exports = createApp({ serverless: true });
