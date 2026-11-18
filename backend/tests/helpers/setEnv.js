'use strict';

const os = require('os');
const path = require('path');

// Test environment. Real values are validated by src/config/env.js.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.JWT_EXPIRES_IN = '30m';
process.env.MONGO_URI = process.env.MONGO_TEST_URI || 'mongodb://127.0.0.1:27017/unused';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.UNIVERSITY_TZ = 'Asia/Seoul';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'kdu-uids-test-uploads');
process.env.MAX_PINNED_NOTICES = '5';
process.env.ENABLE_STATUS_SYNC = 'false';
// Lower bcrypt cost only to keep the test suite fast; production enforces 12.
process.env.BCRYPT_ROUNDS = '4';
// High limits so normal tests are not throttled; rate limiting has its own test app.
process.env.AUTH_LOGIN_RATE_LIMIT = '1000';
process.env.AUTH_RATE_LIMIT = '10000';
