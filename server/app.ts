import express from 'express';
import cors from 'cors';
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

  // Allow cross-origin requests from any client domain (including Vercel deployments)
  app.use(cors({
    origin: true,
    credentials: true,
  }));

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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

  // Error handling middleware
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled API error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
}

export const app = createApp();
