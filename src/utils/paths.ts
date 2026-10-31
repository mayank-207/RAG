import path from 'node:path';

/**
 * Normalizes any file path to use POSIX forward slashes.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Validates that a target path is safely inside a root directory, preventing directory traversal.
 * Throws an error if path escapes the root directory.
 */
export function assertSafePath(rootPath: string, relativeOrFullPath: string): string {
  const normalizedRoot = path.resolve(rootPath);
  const targetFullPath = path.isAbsolute(relativeOrFullPath)
    ? path.resolve(relativeOrFullPath)
    : path.resolve(normalizedRoot, relativeOrFullPath);

  // Check if target starts with normalized root
  if (!targetFullPath.startsWith(normalizedRoot)) {
    throw new Error(`Security Violation: Path traversal detected. '${relativeOrFullPath}' escapes root '${rootPath}'`);
  }

  return targetFullPath;
}

/**
 * Converts an absolute path to a project-relative POSIX path.
 */
export function toRelativePosixPath(rootPath: string, fullPath: string): string {
  const safeFull = assertSafePath(rootPath, fullPath);
  const relative = path.relative(path.resolve(rootPath), safeFull);
  return normalizePath(relative);
}
