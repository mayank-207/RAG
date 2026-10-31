import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { config } from '../config/index.js';

// Ensure log directory exists
const logDir = path.join(config.localDataDir, 'logs');
try {
  fs.mkdirSync(logDir, { recursive: true });
} catch {
  // Ignore if exists
}

const logFile = path.join(logDir, 'app.log');

// Create Pino logger writing to stderr so stdout remains purely for MCP JSON-RPC
export const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
}, pino.multistream([
  { stream: process.stderr },
  { stream: fs.createWriteStream(logFile, { flags: 'a' }) },
]));

export default logger;

