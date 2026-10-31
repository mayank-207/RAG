import { describe, it, expect } from 'vitest';
import { PhpParser } from '../../src/parsers/php.js';
import { JavaScriptParser } from '../../src/parsers/javascript.js';
import { SqlParser } from '../../src/parsers/sql.js';
import { MarkdownParser } from '../../src/parsers/markdown.js';

describe('PHP & Laravel Parser', () => {
  it('extracts class, methods, visibility, and docstrings', () => {
    const code = `<?php
    namespace App\\Models;
    class User extends Model {
        /**
         * Get user projects.
         */
        public function projects() {
            return $this->hasMany(Project::class);
        }
        private function hashSecret($s) {
            return sha1($s);
        }
    }`;

    const res = PhpParser.parse(code, 'app/Models/User.php');
    expect(res.symbols).toHaveLength(3); // User class, projects method, hashSecret method

    const userClass = res.symbols.find((s) => s.name === 'User');
    expect(userClass).toBeDefined();
    expect(userClass?.kind).toBe('model');

    const projectsMethod = res.symbols.find((s) => s.name === 'projects');
    expect(projectsMethod).toBeDefined();
    expect(projectsMethod?.visibility).toBe('public');
    expect(projectsMethod?.parentSymbol).toBe('User');

    const hashSecretMethod = res.symbols.find((s) => s.name === 'hashSecret');
    expect(hashSecretMethod?.visibility).toBe('private');
  });

  it('extracts Laravel routes with HTTP method and controller/action', () => {
    const code = `<?php
    use App\\Http\\Controllers\\ProjectController;
    Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');
    Route::post('/projects', [ProjectController::class, 'store']);
    `;

    const res = PhpParser.parse(code, 'routes/web.php');
    expect(res.routes).toHaveLength(2);
    expect(res.routes[0].httpMethod).toBe('GET');
    expect(res.routes[0].uriPattern).toBe('/projects');
    expect(res.routes[0].controller).toBe('ProjectController');
    expect(res.routes[0].action).toBe('index');
    expect(res.routes[0].routeName).toBe('projects.index');

    expect(res.routes[1].httpMethod).toBe('POST');
  });

  it('extracts schema migrations from Schema::create', () => {
    const code = `<?php
    Schema::create('orders', function (Blueprint $table) {
        $table->id();
        $table->foreignId('user_id')->constrained('users');
        $table->string('status')->nullable();
        $table->timestamps();
    });
    `;

    const res = PhpParser.parse(code, 'database/migrations/2026_create_orders_table.php');
    expect(res.tables).toHaveLength(1);
    expect(res.tables[0].tableName).toBe('orders');
    expect(res.tables[0].columns.length).toBeGreaterThanOrEqual(4);
  });
});

describe('JavaScript & React Parser', () => {
  it('identifies React functional components, hooks, and child components', () => {
    const code = `
    import React from 'react';
    import { useProjects } from '../hooks/useProjects';
    import { ProjectItem } from './ProjectItem';

    export function ProjectList() {
      const { projects } = useProjects();
      return (
        <div className="list">
          {projects.map(p => <ProjectItem key={p.id} id={p.id} />)}
        </div>
      );
    }
    `;

    const res = JavaScriptParser.parse(code, 'src/components/ProjectList.tsx');
    const comp = res.symbols.find((s) => s.name === 'ProjectList');
    expect(comp).toBeDefined();
    expect(comp?.kind).toBe('component');

    const childDep = res.dependencies.find((d) => d.targetModule === 'ProjectItem' && d.dependencyType === 'renders_component');
    expect(childDep).toBeDefined();
  });

  it('identifies custom React hooks and API calls', () => {
    const code = `
    import { useState, useEffect } from 'react';

    export function useInquiryData(inquiryId: string) {
      const [data, setData] = useState(null);
      useEffect(() => {
        fetch('/api/inquiries/' + inquiryId).then(r => r.json()).then(setData);
      }, [inquiryId]);
      return data;
    }
    `;

    const res = JavaScriptParser.parse(code, 'src/hooks/useInquiryData.ts');
    const hook = res.symbols.find((s) => s.name === 'useInquiryData');
    expect(hook).toBeDefined();
    expect(hook?.kind).toBe('hook');
  });
});

describe('SQL Schema Parser', () => {
  it('parses CREATE TABLE statements with primary and foreign keys', () => {
    const code = `
    CREATE TABLE IF NOT EXISTS invoices (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'unpaid',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
    `;

    const res = SqlParser.parse(code, 'schema.sql');
    expect(res.tables).toHaveLength(1);
    expect(res.tables[0].tableName).toBe('invoices');
    const userCol = res.tables[0].columns.find((c) => c.columnName === 'user_id');
    expect(userCol?.foreignTable).toBe('users');
    expect(userCol?.foreignColumn).toBe('id');
  });
});

describe('Markdown & .ai Parser', () => {
  it('extracts approved business rules and topics from markdown sections', () => {
    const md = `
# Engineering CRM Architecture

## User Workflow Rules
- All new users must be created through the admin portal.
- Password hashes must use Argon2id.

## Project Budget Limits
- Maximum project budget without VP approval is $50,000.
    `;

    const res = MarkdownParser.parse(md, '.ai/business-rules.md');
    expect(res.memories.length).toBeGreaterThanOrEqual(2);
    const userRule = res.memories.find((m) => m.topic === 'User Workflow Rules');
    expect(userRule).toBeDefined();
    expect(userRule?.category).toBe('business_rule');
  });
});
