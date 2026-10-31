import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './api/routes.js';
import { AuthService } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function isQdrantReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:6333/', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function ensureQdrantRunning(): Promise<boolean> {
  if (await isQdrantReachable()) return true;

  const qdrantExe = path.resolve(process.cwd(), 'qdrant.exe');
  if (fs.existsSync(qdrantExe)) {
    try {
      const child = spawn(qdrantExe, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();

      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (await isQdrantReachable()) return true;
      }
    } catch {}
  }
  return false;
}

export function createServerApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static directory for frontend assets
  let publicDir = path.join(__dirname, 'public');
  if (!fs.existsSync(publicDir)) {
    publicDir = path.resolve(process.cwd(), 'src', 'server', 'public');
  }
  app.use(express.static(publicDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }));

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
  // Ensure database and schema are initialized
  try {
    const { ensureDatabaseExists } = await import('../db/connection.js');
    await ensureDatabaseExists();
    const { runMigrations } = await import('../db/migrate.js');
    await runMigrations();
  } catch {}

  await AuthService.ensureDefaultAdmin();
  await ensureQdrantRunning().catch(() => {});

  const app = createServerApp();
  return new Promise<{ server: any; url: string }>((resolve) => {
    const server = app.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      resolve({ server, url });
    });
  });
}
