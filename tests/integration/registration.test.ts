import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../../src/projects/manager.js';
import { testDbConnection, closeDbPool, query } from '../../src/db/connection.js';

describe('Project Registration & Multi-Project Isolation', () => {
  const laravelFixturePath = path.resolve('tests/fixtures/synthetic-laravel');
  const reactFixturePath = path.resolve('tests/fixtures/synthetic-react');

  beforeAll(async () => {
    const conn = await testDbConnection();
    if (!conn.ok) {
      console.warn('MySQL not reachable for integration test:', conn.error);
    }
  });

  afterAll(async () => {
    // Clean up test projects
    await ProjectManager.removeProject('test-laravel-crm').catch(() => {});
    await ProjectManager.removeProject('test-react-app').catch(() => {});
    await closeDbPool();
  });

  it('registers multiple projects independently and creates default workspaces', async () => {
    const laravel = await ProjectManager.registerProject({
      id: 'test-laravel-crm',
      name: 'Test Laravel CRM',
      rootPath: laravelFixturePath,
      framework: 'laravel',
      primaryLanguage: 'php',
    });

    const react = await ProjectManager.registerProject({
      id: 'test-react-app',
      name: 'Test React App',
      rootPath: reactFixturePath,
      framework: 'react',
      primaryLanguage: 'typescript',
    });

    expect(laravel.project.id).toBe('test-laravel-crm');
    expect(laravel.project.framework).toBe('laravel');
    expect(laravel.workspace.name).toBe('working-copy');

    expect(react.project.id).toBe('test-react-app');
    expect(react.project.framework).toBe('react');

    // Verify isolation in MySQL projects table
    const projects = await ProjectManager.listProjects();
    const ids = projects.map((p) => p.id);
    expect(ids).toContain('test-laravel-crm');
    expect(ids).toContain('test-react-app');
  });

  it('updates project configuration cleanly', async () => {
    const updated = await ProjectManager.updateProject('test-laravel-crm', {
      description: 'Updated CRM description',
    });
    expect(updated.description).toBe('Updated CRM description');
  });

  it('distinguishes between purging index data and removing project registration', async () => {
    // Insert mock indexed file
    await query(
      `INSERT INTO indexed_files
        (project_id, workspace_id, relative_path, file_extension, language, content_hash, size_bytes)
       VALUES ('test-laravel-crm', 'test-laravel-crm:working-copy', 'app/Models/User.php', '.php', 'php', 'mockhash', 100)
       ON DUPLICATE KEY UPDATE content_hash = VALUES(content_hash)`
    );

    // Purge index only
    await ProjectManager.removeProject('test-laravel-crm', true);

    // Registration must still exist
    const proj = await ProjectManager.getProject('test-laravel-crm');
    expect(proj).not.toBeNull();

    // But indexed file must be purged
    const files = await query<any[]>('SELECT * FROM indexed_files WHERE project_id = ?', ['test-laravel-crm']);
    expect(files).toHaveLength(0);
  });
});
