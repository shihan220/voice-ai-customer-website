import cors from 'cors';
import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import expressSession, { type SessionOptions } from 'express-session';
import {
  adminDistRoot,
  adminSessionCookieName,
  adminSessionSecret,
  customerSessionCookieName,
  customerSessionSecret,
  getAllowedCorsOrigins,
  mediaRoot,
} from './core.ts';
import { pool } from './db.ts';
import { createAdminRouter } from './routes/admin.ts';
import { createAuthRouter } from './routes/auth.ts';
import { createPaymentsRouter } from './routes/payments.ts';
import { createPublicRouter } from './routes/public.ts';
import { createSamplesRouter } from './routes/samples.ts';
import { createUserRouter } from './routes/user.ts';

export function createApp() {
  const app = express();
  const session = expressSession as unknown as (options: SessionOptions) => ReturnType<typeof expressSession>;
  const PgSessionStore = connectPgSimple(session);
  const allowedCorsOrigins = getAllowedCorsOrigins();
  const corsMiddleware = cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed.'));
    },
  });
  const customerSessionMiddleware = session({
    name: customerSessionCookieName,
    secret: customerSessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgSessionStore({
      pool,
      tableName: 'customer_sessions',
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 30,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });
  const adminSessionMiddleware = session({
    name: adminSessionCookieName,
    secret: adminSessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgSessionStore({
      pool,
      tableName: 'admin_sessions',
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 12,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  });

  app.use((req, res, next) => {
    corsMiddleware(req, res, (error) => {
      if (error) {
        res.status(403).json({ error: 'CORS origin is not allowed.' });
        return;
      }

      next();
    });
  });
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buffer) => {
        (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(['/api/admin', '/admin'], adminSessionMiddleware);
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/admin') || req.path.startsWith('/admin')) {
      next();
      return;
    }

    customerSessionMiddleware(req, res, next);
  });

  app.use('/media', express.static(mediaRoot));
  app.use('/admin', express.static(adminDistRoot, { index: false }));
  app.use(createPublicRouter());
  app.use(createAuthRouter());
  app.use(createUserRouter());
  app.use(createPaymentsRouter());
  app.use(createSamplesRouter());
  app.use(createAdminRouter());

  return app;
}
