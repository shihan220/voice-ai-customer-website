import cors from 'cors';
import connectPgSimple from 'connect-pg-simple';
import express, { type ErrorRequestHandler } from 'express';
import expressSession, { type SessionOptions } from 'express-session';
import path from 'node:path';
import {
  adminDistRoot,
  adminSessionCookieName,
  adminSessionSecret,
  bundledMediaRoot,
  customerSessionCookieName,
  customerSessionSecret,
  frontendDistRoot,
  getAllowedCorsOrigins,
  isCustomerEmailVerificationRequired,
  isCustomerPhoneVerificationRequired,
  mediaRoot,
} from './core.ts';
import { pool } from './db.ts';
import { createAdminRouter } from './routes/admin.ts';
import { createAuthRouter } from './routes/auth.ts';
import { createPaymentsRouter } from './routes/payments.ts';
import { createPublicRouter } from './routes/public.ts';
import { createSamplesRouter } from './routes/samples.ts';
import { createTtsRouter } from './routes/tts.ts';
import { createUserRouter } from './routes/user.ts';

const publicFrontendRoutes = new Set([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verify-phone',
  '/dashboard',
  '/account',
  '/payment/success',
  '/payment/failed',
]);

function isPublicFrontendRoute(pathname: string) {
  return publicFrontendRoutes.has(pathname) || /^\/dashboard\/jobs\/\d+$/.test(pathname);
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

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
    if (req.get('host') === 'www.banglaspeechai.com') {
      res.redirect(301, `https://banglaspeechai.com${req.originalUrl}`);
      return;
    }

    next();
  });

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self), payment=(), usb=()');
    res.setHeader('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'");

    if (req.secure || req.get('x-forwarded-proto') === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    next();
  });

  app.use((req, res, next) => {
    const origin = req.get('origin');
    const host = req.get('host');

    if (origin && host) {
      try {
        if (new URL(origin).host === host) {
          next();
          return;
        }
      } catch {
        // Let the CORS middleware reject malformed origins below.
      }
    }

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

  app.use(['/media/tts-jobs', '/media/tts-voice-profiles'], (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.use('/media', express.static(mediaRoot));
  if (path.resolve(bundledMediaRoot) !== path.resolve(mediaRoot)) {
    app.use('/media', express.static(bundledMediaRoot));
  }
  app.use('/media', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.get('/favicon.ico', (_req, res) => {
    res.redirect(302, '/favicon.png');
  });
  app.use('/admin', express.static(adminDistRoot, { index: false }));
  app.use(createPublicRouter());
  app.use(createAuthRouter());
  app.use(createUserRouter());
  app.use(createPaymentsRouter());
  app.use(createSamplesRouter());
  app.use(createTtsRouter());
  app.use(createAdminRouter());
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });
  app.get(['/verify-email', '/verify-phone'], (_req, res, next) => {
    if (!isCustomerEmailVerificationRequired() && !isCustomerPhoneVerificationRequired()) {
      res.redirect(302, '/dashboard');
      return;
    }

    next();
  });
  app.use(express.static(frontendDistRoot, { index: false }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/admin') || req.path.startsWith('/media')) {
      next();
      return;
    }

    if (!isPublicFrontendRoute(req.path)) {
      res.status(404);
    }

    res.sendFile(path.join(frontendDistRoot, 'index.html'), (error) => {
      if (error) {
        res.status(503).send('Public frontend is not built yet. Run npm run build first.');
      }
    });
  });

  const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const status = typeof error?.status === 'number' && error.status >= 400 ? error.status : 500;
    const isClientError = status >= 400 && status < 500;
    const message = isClientError ? 'Bad request.' : 'Internal server error.';

    if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
      res.status(status).json({ error: message });
      return;
    }

    res.status(status).send(message);
  };

  app.use(errorHandler);

  return app;
}
