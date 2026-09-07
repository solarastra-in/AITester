import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './server/app.js';

dotenv.config();

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

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
