import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './api/routes.js';
import { AuthService } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServerApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static directory for frontend assets
  let publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    publicDir = path.resolve(process.cwd(), 'src', 'server', 'public');
  }
  app.use(express.static(publicDir));

  // Mount API router
  app.use('/api', apiRouter);

  // SPA fallback for HTML5 history navigation
  app.use((req, res) => {
    // If request asks for an asset or api that was not found, return 404
    if (req.path.startsWith('/api/') || req.path.includes('.')) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    const indexPath = path.join(publicDir, 'index.html');
    res.sendFile(indexPath);
  });

  return app;
}

export async function startDashboardServer(port: number = 3000, host: string = '127.0.0.1') {
  await AuthService.ensureDefaultAdmin();

  const app = createServerApp();
  return new Promise<{ server: any; url: string }>((resolve) => {
    const server = app.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      resolve({ server, url });
    });
  });
}
