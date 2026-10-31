import crypto from 'node:crypto';

/**
 * Calculates SHA-256 hash of a string or buffer.
 */
export function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generates a deterministic chunk ID based on project, file relative path, and content.
 */
export function generateChunkId(projectId: string, relativePath: string, startLine: number, endLine: number, content: string): string {
  return sha256(`${projectId}:${relativePath}:${startLine}:${endLine}:${sha256(content)}`);
}

