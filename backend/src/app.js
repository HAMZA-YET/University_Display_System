'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');

const { loadEnv } = require('./config/env');
const logger = require('./utils/logger');
const requestId = require('./middleware/requestId');
const rejectOperators = require('./middleware/rejectOperators');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');
const asyncHandler = require('./utils/asyncHandler');
const { readiness, requireDatabase } = require('./config/readiness');

const createAuthRouter = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const departmentRoutes = require('./modules/departments/department.routes');
const notices = require('./modules/notices/notice.routes');
const events = require('./modules/events/event.routes');
const professorRoutes = require('./modules/professors/professor.routes');
const domainEventRoutes = require('./modules/domainEvents/domainEvent.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const attachments = require('./modules/attachments/attachment.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const memberToolsRoutes = require('./modules/member-tools/memberTools.routes');
const setupRoutes = require('./modules/setup/setup.routes');
const lostFound = require('./modules/lostFound/lostFound.routes');
const { authorizeEvidence: lostFoundEvidence } = require('./modules/lostFound/lostFound.evidence');

/**
 * Builds the Express app without listening, so tests can use it directly.
 * options.loginRateLimit / options.authRateLimit override the env values.
 */
function createApp(options = {}) {
  const env = loadEnv();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', process.env.VERCEL ? 1 : 'loopback');
  app.set('query parser', 'extended');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: env.NODE_ENV !== 'test',
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(rejectOperators);

  app.get('/api/health', asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ data: await readiness({ connect: true }) });
  }));
  app.get('/api/ready', asyncHandler(async (req, res) => {
    const data = await readiness({ connect: true });
    res.setHeader('Cache-Control', 'no-store');
    res.status(data.ready ? 200 : 503).json({ data });
  }));
  app.use('/api', requireDatabase);
  app.use('/api', require('./modules/security/operations').guard);
  app.use('/api/operations', require('./modules/security/operations').router);

  app.use(
    '/api/auth',
    createAuthRouter({
      loginLimit: options.loginRateLimit || env.AUTH_LOGIN_RATE_LIMIT,
      generalLimit: options.authRateLimit || env.AUTH_RATE_LIMIT,
    })
  );
  app.use('/api/private-evidence', require('./modules/security/evidence').createEvidenceRouter(options.authorizeEvidence || lostFoundEvidence));
  app.use('/api/security', require('./modules/security/routes')());
  app.use('/api/users', userRoutes);
  app.use('/api/departments', departmentRoutes);
  app.use('/api/public/home', notices.homeRouter);
  app.use('/api/public/notices', notices.publicRouter);
  app.use('/api/public/events', events.publicRouter);
  app.use('/api/public/attachments', attachments.publicRouter);
  app.use('/api/notices', notices.router);
  app.use('/api/events', events.router);
  app.use('/api/professors', professorRoutes);
  app.use('/api/domain-events', domainEventRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/attachments', attachments.managementRouter);
  app.use('/api/admin', adminRoutes);
  app.use('/api/member-tools', memberToolsRoutes);
  app.use('/api/setup', setupRoutes);
  app.use('/api/public/lost-found', lostFound.publicRouter);
  app.use('/api/lost-found', lostFound.router);

  app.use('/api', notFound);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
