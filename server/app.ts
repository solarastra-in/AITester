import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { authRouter } from './routes/authRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { orgRouter } from './routes/orgRoutes.js';
import { projectRouter } from './routes/projectRoutes.js';
import { billingRouter } from './routes/billingRoutes.js';
import { packageRouter } from './routes/packageRoutes.js';
import { contactRouter } from './routes/contactRoutes.js';
import { checkTestCaseSecurity, AuthRequest } from './auth.js';
import { db } from './db.js';

dotenv.config();

export function createApp() {
  const app = express();

  // Disabled by default: helmet's CSP is opinionated and this is a React SPA
  // served alongside the API from the same Express process, so a blanket
  // default-src 'self' policy would need real tuning (inline styles from
  // Tailwind's JIT, any CDN scripts, etc.) to avoid breaking the frontend.
  // The other headers helmet sets (X-Content-Type-Options, X-Frame-Options,
  // Strict-Transport-Security, etc.) are safe defaults with no such
  // trade-off, so those are kept on.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS: origins are explicit, not reflected. CORS_ALLOWED_ORIGINS is a
  // comma-separated list (e.g. "https://verity.whyor.in,https://your-app.vercel.app").
  // Falls back to reflecting any origin ONLY outside production (so local
  // dev / preview deployments without the env var configured still work),
  // with a console warning so a misconfigured production deploy is obvious
  // in the logs rather than silently over-permissive.
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && allowedOrigins.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[SECURITY WARNING] CORS_ALLOWED_ORIGINS is not set in production — reflecting all origins. ' +
        'Set CORS_ALLOWED_ORIGINS to a comma-separated allowlist (e.g. your production domain(s)).'
    );
  }

  app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    // No cookie-based auth in this app (JWTs are sent via the Authorization
    // header, not cookies), so credentialed CORS isn't needed — omitting it
    // removes the classic "reflected origin + credentials" CSRF-adjacent
    // risk entirely regardless of the allowlist above.
  }));

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Rate limit auth endpoints specifically — login/register are the classic
  // brute-force / credential-stuffing target, and previously had no
  // protection at all.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register-standalone', authLimiter);

  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'Verity Automated Test Platform',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/org', orgRouter);
  app.use('/api/projects', projectRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/package', packageRouter);
  app.use('/api/contact', contactRouter);

  // Direct test cases route guarded by checkTestCaseSecurity middleware
  app.get('/api/test-cases', checkTestCaseSecurity, (req: AuthRequest, res) => {
    const projectId = req.query.projectId as string;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId query parameter is required.' });
    }
    const project = (req as any).project || db.findProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    const suites = db.data.suites.filter(s => s.projectId === project.id);
    const suiteIds = suites.map(s => s.id);
    const cases = db.data.testCases.filter(c => suiteIds.includes(c.suiteId));
    res.json({ cases, project });
  });

  app.use(apiErrorHandler);

  return app;
}

// Error handling middleware. Client errors (4xx) keep their specific
// message, since those are meant to be actionable for the caller (e.g.
// "Insufficient credits"). Server errors (5xx) log the real error for
// operators but return a generic message to the client — the original
// code returned err.message unconditionally for every error, which risks
// leaking internal implementation detail (file paths, stack fragments,
// library error text) to an unauthenticated caller. Exported separately
// (rather than an inline anonymous handler) so it's directly unit-testable.
export function apiErrorHandler(err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) {
  console.error('Unhandled API error:', err);
  const status = err.status || 500;
  const message = status >= 500 ? 'Internal Server Error' : (err.message || 'Request failed');
  res.status(status).json({ error: message });
}

export const app = createApp();
