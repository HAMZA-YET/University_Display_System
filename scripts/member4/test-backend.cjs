'use strict';
// Local test entry only. It never accepts a production MongoDB URI.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const env = { ...process.env, NODE_ENV: 'test', MONGOMS_DOWNLOAD_DIR: path.join(root, 'node_modules/.cache/mongodb-binaries'), MONGOMS_RESUME_DOWNLOAD: 'true' };
for (const key of ['MONGO_URI', 'MONGODB_URI', 'MONGO_TEST_URI', 'JWT_SECRET', 'BOOTSTRAP_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID']) delete env[key];
const jest = spawnSync(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), '--runInBand', ...process.argv.slice(2)], { cwd: path.join(root, 'backend'), env, stdio: 'inherit', windowsHide: true });
if (jest.error) { console.error(jest.error.message); process.exit(1); }
if (jest.status !== 0) process.exit(jest.status || 1);
const operator = spawnSync(process.execPath, ['--test', 'tests/operator-sample-content.test.cjs'], { cwd: path.join(root, 'backend'), env, stdio: 'inherit', windowsHide: true });
process.exit(operator.status || (operator.error ? 1 : 0));
