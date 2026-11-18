'use strict';

// Trusted, manual deployment maintenance only. Never imported by app/start/build.
const CONFIRMATION = 'INSTALL_FICTIONAL_SAMPLE_CONTENT';
const COUNT_KEYS = ['departments', 'professors', 'notices', 'events'];

class OperatorInvocationError extends Error {}

function validateInvocation(argv, environment) {
  if (argv.length !== 2 || argv[0] !== '--confirm' || argv[1] !== CONFIRMATION) {
    throw new OperatorInvocationError('Explicit --confirm INSTALL_FICTIONAL_SAMPLE_CONTENT is required.');
  }
  if (environment.NODE_ENV !== 'production') {
    throw new OperatorInvocationError('This maintenance command requires NODE_ENV=production.');
  }
  const uri = environment.MONGO_URI || environment.MONGODB_URI;
  if (typeof uri !== 'string' || !/^mongodb(?:\+srv)?:\/\//.test(uri.trim())) {
    throw new OperatorInvocationError('A configured production MONGODB_URI (or MONGO_URI) is required.');
  }
  if (typeof environment.JWT_SECRET !== 'string' || environment.JWT_SECRET.length < 32) {
    throw new OperatorInvocationError('A configured production JWT_SECRET of at least 32 characters is required.');
  }
}

function defaultDependencies() {
  // Suppress framework/connection logs. The command prints only count summaries,
  // never administrator identities, connection strings, tokens, or driver errors.
  process.env.LOG_LEVEL = 'silent';
  const { loadEnv } = require('../src/config/env');
  const { connectDb, disconnectDb } = require('../src/config/db');
  const User = require('../src/modules/users/user.model');
  const service = require('../src/modules/sample-content/sampleContent.service');
  return {
    loadEnv,
    connectDb,
    disconnectDb,
    oldestAdministrator: () => User.findOne({ role: 'ADMIN', isActive: true })
      .sort({ createdAt: 1, _id: 1 }).select('_id role isActive').lean(),
    install: service.install,
  };
}

function countSummary(result) {
  const out = { created: {}, counts: {} };
  for (const group of ['created', 'counts']) {
    for (const key of COUNT_KEYS) {
      const value = result && result[group] && result[group][key];
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid sample count result.');
      out[group][key] = value;
    }
  }
  return out;
}

async function run(argv = process.argv.slice(2), environment = process.env, dependenciesFactory = defaultDependencies) {
  // Guard before loading any DB modules or opening a connection.
  validateInvocation(argv, environment);
  const dependencies = dependenciesFactory();
  try {
    const env = dependencies.loadEnv();
    await dependencies.connectDb(env.MONGO_URI);
    const administrator = await dependencies.oldestAdministrator();
    if (!administrator) throw new Error('No active existing administrator is available.');
    const result = await dependencies.install({
      user: administrator,
      requestId: 'operator-deployment-maintenance-sample-install',
      ip: null,
    }, { invocationSource: 'deployment-maintenance' });
    return countSummary(result);
  } finally {
    await dependencies.disconnectDb();
  }
}

function failureMessage(error) {
  return error instanceof OperatorInvocationError
    ? error.message
    : 'Sample-content maintenance failed. Check the deployment configuration and existing administrator; no sensitive error details were printed.';
}

if (require.main === module) {
  run().then((counts) => console.log(JSON.stringify(counts))).catch((error) => {
    console.error(failureMessage(error));
    process.exitCode = 1;
  });
}

module.exports = { run, validateInvocation, countSummary, failureMessage };
