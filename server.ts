import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import { authRouter } from './server/routes/authRoutes.js';
import { adminRouter } from './server/routes/adminRoutes.js';
import { orgRouter } from './server/routes/orgRoutes.js';
import { projectRouter } from './server/routes/projectRoutes.js';
import { billingRouter } from './server/routes/billingRoutes.js';
import { packageRouter } from './server/routes/packageRoutes.js';
import { contactRouter } from './server/routes/contactRoutes.js';
import { checkTestCaseSecurity, AuthRequest } from './server/auth.js';
import { db } from './server/db.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

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

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Verity Automated Test Platform running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start Verity server:', err);
  process.exit(1);
});
