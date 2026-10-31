/**
 * code-context-mcp Local Admin Dashboard
 * Client-side Controller & Single-Page Application Router
 */

(function () {
  'use strict';

  // State Management
  const state = {
    currentUser: null,
    activeView: 'dashboard',
    selectedProjectId: null,
    projects: [],
    filesFilter: { projectId: '', extension: '', search: '', page: 1, limit: 25 },
    chunksFilter: { projectId: '', type: '', search: '', page: 1, limit: 20 },
    symbolsFilter: { projectId: '', kind: '', search: '', page: 1, limit: 30 },
    depsFilter: { projectId: '', search: '' },
    currentEditingProviderId: null,
  };

  // ==============================================================================
  // 1. HTTP Client & Auth Utilities
  // ==============================================================================

  function getToken() {
    return localStorage.getItem('code_context_token') || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem('code_context_token', token);
    else localStorage.removeItem('code_context_token');
  }

  async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    const token = getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(endpoint, {
        ...options,
        headers,
      });

      if (res.status === 401) {
        setToken('');
        showLoginModal();
        throw new Error('Unauthorized');
      }

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `HTTP error ${res.status}`);
      }

      return data;
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        console.error(`API Error on ${endpoint}:`, err);
      }
      throw err;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let idx = 0;
    let b = Number(bytes);
    while (b >= 1024 && idx < units.length - 1) {
      b /= 1024;
      idx++;
    }
    return `${b.toFixed(1)} ${units[idx]}`;
  }

  function formatDate(d) {
    if (!d) return 'Never';
    const date = new Date(d);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatDuration(ms) {
    if (!ms || isNaN(ms)) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const remSecs = seconds % 60;
    return `${mins}m ${remSecs}s`;
  }

  // ==============================================================================
  // 2. Authentication UI
  // ==============================================================================

  const loginOverlay = document.getElementById('login-overlay');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const appShell = document.getElementById('app-shell');
  const userDisplayName = document.getElementById('user-display-name');
  const logoutBtn = document.getElementById('logout-btn');

  function showLoginModal() {
    loginOverlay.classList.remove('hidden');
    appShell.classList.add('hidden');
  }

  function hideLoginModal() {
    loginOverlay.classList.add('hidden');
    appShell.classList.remove('hidden');
  }

  async function checkAuth() {
    try {
      const data = await apiFetch('/api/auth/me');
      state.currentUser = data.user;
      userDisplayName.textContent = data.user.username;
      hideLoginModal();
      handleNavigation();
    } catch {
      showLoginModal();
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setToken(data.token);
      state.currentUser = data.user;
      userDisplayName.textContent = data.user.username;
      hideLoginModal();
      handleNavigation();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.remove('hidden');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setToken('');
    state.currentUser = null;
    showLoginModal();
  });

  // ==============================================================================
  // 3. Navigation & Routing
  // ==============================================================================

  const navLinks = document.querySelectorAll('.sidebar-nav .nav-item');
  const pageTitle = document.getElementById('page-title');

  function setActiveView(viewId) {
    state.activeView = viewId;
    document.querySelectorAll('.view-panel').forEach((panel) => {
      panel.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');

    navLinks.forEach((link) => {
      if (link.getAttribute('data-view') === viewId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    const titleMap = {
      dashboard: 'Dashboard',
      projects: 'Projects Management',
      'project-detail': 'Project Details',
      files: 'Indexed Files',
      chunks: 'Code Chunks',
      symbols: 'Code Symbols',
      dependencies: 'Dependency Graph',
      indexing: 'Indexing Management',
      'ai-models': 'AI Model Providers',
      'embedding-settings': 'Embedding Settings',
      system: 'System Settings & Diagnostics',
      logs: 'Logs & Diagnostics',
      docs: 'Documentation',
    };

    pageTitle.textContent = titleMap[viewId] || 'Dashboard';
  }

  function handleNavigation() {
    if (!state.currentUser) return;

    const hash = window.location.hash.replace(/^#/, '');

    if (hash.startsWith('project-detail/')) {
      const projectId = hash.replace('project-detail/', '');
      state.selectedProjectId = projectId;
      setActiveView('project-detail');
      loadProjectDetail(projectId);
      return;
    }

    const view = hash || 'dashboard';
    setActiveView(view);

    switch (view) {
      case 'dashboard':
        loadDashboardStats();
        break;
      case 'projects':
        loadProjects();
        break;
      case 'files':
        loadFiles();
        break;
      case 'chunks':
        loadChunks();
        break;
      case 'symbols':
        loadSymbols();
        break;
      case 'dependencies':
        loadDependencies();
        break;
      case 'indexing':
        loadIndexingJobs();
        break;
      case 'ai-models':
        loadAIProviders();
        loadModelAssignments();
        break;
      case 'embedding-settings':
        loadEmbeddingSettings();
        break;
      case 'system':
        loadSystemSettings();
        break;
      case 'logs':
        loadLogs();
        break;
      case 'docs':
        // Static
        break;
    }
  }

  window.addEventListener('hashchange', handleNavigation);

  // Global Refresh Button
  document.getElementById('refresh-global-btn').addEventListener('click', () => {
    handleNavigation();
  });

  // ==============================================================================
  // 4. View 1: Dashboard
  // ==============================================================================

  async function loadDashboardStats() {
    try {
      const data = await apiFetch('/api/dashboard/stats');
      const { summary, services } = data;

      // Update counters
      document.getElementById('stat-total-projects').textContent = summary.totalRegisteredProjects;
      document.getElementById('stat-connected-projects').textContent = `Connected: ${summary.totalConnectedProjects}`;
      document.getElementById('stat-indexed-projects').textContent = summary.totalIndexedProjects;
      document.getElementById('stat-pending-projects').textContent = `Pending: ${summary.projectsPendingIndexing}`;
      document.getElementById('stat-total-files').textContent = summary.totalIndexedFiles;
      document.getElementById('stat-total-chunks').textContent = summary.totalCodeChunks;
      document.getElementById('stat-total-embeddings').textContent = `Embeddings: ${summary.totalEmbeddingsGenerated}`;
      document.getElementById('stat-total-symbols').textContent = summary.totalIndexedSymbols;
      document.getElementById('stat-last-index').textContent = summary.lastSuccessfulIndexingTime
        ? formatDate(summary.lastSuccessfulIndexingTime)
        : 'Never';
      document.getElementById('stat-active-model').textContent = `Model: ${summary.activeAIModel || 'None'}`;

      // Update Topbar Service Pills
      updateServicePill('service-pill-mysql', services.mysql.status);
      updateServicePill('service-pill-qdrant', services.qdrant.status);
      updateServicePill('service-pill-ollama', services.ollama.status);
      updateServicePill('service-pill-mcp', services.mcp.status);

      // Populate Quick Codebases Table
      await loadDashboardProjectsTable();

      // Populate Service Diagnostics List
      renderServiceList(services);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    }
  }

  function updateServicePill(pillId, status) {
    const el = document.getElementById(pillId);
    if (!el) return;
    el.classList.remove('connected', 'disconnected', 'checking');
    if (status === 'connected') el.classList.add('connected');
    else if (status === 'disconnected') el.classList.add('disconnected');
    else el.classList.add('checking');
  }

  async function loadDashboardProjectsTable() {
    const tableBody = document.querySelector('#dashboard-projects-table tbody');
    try {
      const res = await apiFetch('/api/projects');
      state.projects = res.projects || [];

      if (state.projects.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No projects registered yet. Click "Projects" to register your codebase.</td></tr>';
        return;
      }

      tableBody.innerHTML = state.projects
        .map((p) => {
          const statusClass = p.isPathValid ? 'badge-success' : 'badge-danger';
          const statusText = p.isPathValid ? 'Connected' : 'Missing Path';
          return `
            <tr>
              <td>
                <strong>${escapeHtml(p.name)}</strong>
                <div class="mono text-muted text-xs">${escapeHtml(p.root_path)}</div>
              </td>
              <td><span class="badge badge-neutral">${escapeHtml(p.framework || 'Generic')}</span></td>
              <td>${p.file_count || 0}</td>
              <td>${p.chunk_count || 0}</td>
              <td><span class="badge ${statusClass}">${statusText}</span></td>
              <td>
                <a href="#project-detail/${p.id}" class="btn btn-secondary btn-sm">Inspect</a>
              </td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load projects: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderServiceList(services) {
    const listEl = document.getElementById('dashboard-services-list');
    if (!listEl) return;

    listEl.innerHTML = `
      <div class="service-item">
        <div class="service-meta">
          <strong>MySQL 8.4 Relational Database</strong>
          <span class="text-muted">${services.mysql.version || 'Localhost port 3306'}</span>
        </div>
        <span class="badge ${services.mysql.status === 'connected' ? 'badge-success' : 'badge-danger'}">
          ${services.mysql.status}
        </span>
      </div>
      <div class="service-item">
        <div class="service-meta">
          <strong>Qdrant Vector Database</strong>
          <span class="text-muted">${services.qdrant.collectionsCount !== undefined ? services.qdrant.collectionsCount + ' collections' : 'Port 6333'}</span>
        </div>
        <span class="badge ${services.qdrant.status === 'connected' ? 'badge-success' : 'badge-danger'}">
          ${services.qdrant.status}
        </span>
      </div>
      <div class="service-item">
        <div class="service-meta">
          <strong>Ollama Local Embeddings</strong>
          <span class="text-muted">${services.ollama.modelAvailable ? 'Embedding model ready' : 'Port 11434'}</span>
        </div>
        <span class="badge ${services.ollama.status === 'connected' ? 'badge-success' : 'badge-danger'}">
          ${services.ollama.status}
        </span>
      </div>
      <div class="service-item">
        <div class="service-meta">
          <strong>MCP Server Protocol</strong>
          <span class="text-muted">Transport: stdio (${services.mcp.version || 'v1.0'})</span>
        </div>
        <span class="badge badge-success">Ready</span>
      </div>
    `;
  }

  document.getElementById('refresh-services-btn').addEventListener('click', async () => {
    await loadDashboardStats();
  });

  // ==============================================================================
  // 5. View 2: Projects Management
  // ==============================================================================

  async function loadProjects() {
    const tableBody = document.querySelector('#projects-table tbody');
    try {
      const res = await apiFetch('/api/projects');
      state.projects = res.projects || [];

      // Update project dropdowns across other views
      populateProjectDropdowns(state.projects);

      if (state.projects.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No projects registered. Click "Register New Project" above.</td></tr>';
        return;
      }

      tableBody.innerHTML = state.projects
        .map((p) => {
          return `
            <tr>
              <td>
                <strong>${escapeHtml(p.name)}</strong>
                <div class="text-xs text-muted">ID: ${escapeHtml(p.id)}</div>
              </td>
              <td><span class="mono text-xs">${escapeHtml(p.root_path)}</span></td>
              <td><span class="badge badge-neutral">${escapeHtml(p.framework || 'auto')}</span></td>
              <td><code>${escapeHtml(p.gitBranch || 'main')}</code></td>
              <td>${p.file_count || 0}</td>
              <td>${p.chunk_count || 0}</td>
              <td>${formatDate(p.last_indexed_at)}</td>
              <td><span class="badge ${getStatusBadge(p.indexingStatus)}">${p.indexingStatus}</span></td>
              <td>
                <div class="action-btn-group">
                  <a href="#project-detail/${p.id}" class="btn btn-secondary btn-sm" title="Inspect">View</a>
                  <button class="btn btn-primary btn-sm trigger-idx-btn" data-project="${p.id}" data-mode="incremental" title="Incremental Index">Sync</button>
                  <button class="btn btn-danger btn-sm delete-project-btn" data-project="${p.id}" title="Remove registration">Remove</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      // Wire action buttons
      tableBody.querySelectorAll('.trigger-idx-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const projId = btn.getAttribute('data-project');
          const mode = btn.getAttribute('data-mode');
          btn.disabled = true;
          btn.textContent = 'Indexing...';
          try {
            await apiFetch(`/api/projects/${projId}/index`, {
              method: 'POST',
              body: JSON.stringify({ mode }),
            });
            alert(`Indexing started successfully for project ${projId}!`);
            loadProjects();
          } catch (err) {
            alert(`Indexing error: ${err.message}`);
            btn.disabled = false;
            btn.textContent = 'Sync';
          }
        });
      });

      tableBody.querySelectorAll('.delete-project-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const projId = btn.getAttribute('data-project');
          const purge = confirm(`Remove project "${projId}" registration?\n\nClick OK to remove registration and keep source code untouched.\n(You will be asked if you want to also purge cached vectors).`);
          if (!purge) return;

          const purgeIndexData = confirm(`Do you also want to delete the generated local index & vector data for "${projId}"?`);

          try {
            await apiFetch(`/api/projects/${projId}?purgeIndexOnly=${purgeIndexData ? 'true' : 'false'}`, {
              method: 'DELETE',
            });
            alert('Project registration removed successfully.');
            loadProjects();
          } catch (err) {
            alert(`Error: ${err.message}`);
          }
        });
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="9" class="text-danger">Failed to load projects: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case 'indexed':
        return 'badge-success';
      case 'indexing':
        return 'badge-warning';
      case 'failed':
      case 'disconnected':
        return 'badge-danger';
      default:
        return 'badge-neutral';
    }
  }

  function populateProjectDropdowns(projects) {
    const dropdownIds = [
      'files-project-filter',
      'chunks-project-filter',
      'symbols-project-filter',
      'deps-project-filter',
      'idx-project-select',
    ];

    dropdownIds.forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;

      const currentVal = select.value;
      const isAllOptionNeeded = id !== 'idx-project-select';

      let options = isAllOptionNeeded ? '<option value="">All Projects</option>' : '';
      options += projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${p.id})</option>`).join('');

      select.innerHTML = options;
      if (currentVal) select.value = currentVal;
    });
  }

  // Register Project Modal
  const regModal = document.getElementById('register-project-modal');
  const openRegModalBtn = document.getElementById('open-register-modal-btn');
  const closeRegModalBtn = document.getElementById('close-reg-modal');
  const cancelRegModalBtn = document.getElementById('cancel-reg-modal');
  const regForm = document.getElementById('register-project-form');
  const regError = document.getElementById('reg-error');

  openRegModalBtn.addEventListener('click', () => {
    regError.classList.add('hidden');
    regForm.reset();
    regModal.classList.remove('hidden');
  });

  function closeRegModal() {
    regModal.classList.add('hidden');
  }

  closeRegModalBtn.addEventListener('click', closeRegModal);
  cancelRegModalBtn.addEventListener('click', closeRegModal);

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.classList.add('hidden');

    const rootPath = document.getElementById('reg-path').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const id = document.getElementById('reg-id').value.trim() || undefined;
    const framework = document.getElementById('reg-framework').value;
    const description = document.getElementById('reg-desc').value.trim() || undefined;

    try {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          rootPath,
          name,
          id,
          framework: framework === 'auto' ? undefined : framework,
          description,
        }),
      });

      closeRegModal();
      loadProjects();
    } catch (err) {
      regError.textContent = err.message;
      regError.classList.remove('hidden');
    }
  });

  // ==============================================================================
  // 6. View 3: Project Detail View
  // ==============================================================================

  async function loadProjectDetail(projectId) {
    try {
      const res = await apiFetch(`/api/projects/${projectId}`);
      const { project, gitState, workspaces, stats, jobs, errors } = res;

      document.getElementById('pd-name').textContent = project.name;
      document.getElementById('pd-path').textContent = project.root_path;

      // Overview Tab Content
      const overviewEl = document.getElementById('pd-overview-content');
      overviewEl.innerHTML = `
        <div class="card">
          <div class="card-header"><h4>Project Overview</h4></div>
          <div class="card-body">
            <p><strong>Description:</strong> ${escapeHtml(project.description || 'No description provided')}</p>
            <p><strong>Primary Language:</strong> <span class="badge badge-neutral">${escapeHtml(project.primary_language || 'auto')}</span></p>
            <p><strong>Framework:</strong> <span class="badge badge-neutral">${escapeHtml(project.framework || 'generic')}</span></p>
            <p><strong>Default Branch:</strong> <code>${escapeHtml(project.default_branch || 'main')}</code></p>
            <p><strong>Registered:</strong> ${formatDate(project.created_at)}</p>
            <p><strong>Last Indexed:</strong> ${formatDate(project.last_indexed_at)}</p>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>Git & Working Copy Status</h4></div>
          <div class="card-body">
            <p><strong>Git Repository:</strong> ${gitState.isGit ? '<span class="badge badge-success">Detected</span>' : '<span class="badge badge-neutral">Not a Git Repo</span>'}</p>
            <p><strong>Current Branch:</strong> <code>${escapeHtml(gitState.currentBranch || 'N/A')}</code></p>
            <p><strong>Commit Hash:</strong> <span class="mono text-xs">${escapeHtml(gitState.commitHash || 'None')}</span></p>
            <p><strong>Modified Files:</strong> ${gitState.uncommittedFiles.modified.length}</p>
            <p><strong>Untracked Files:</strong> ${gitState.uncommittedFiles.created.length}</p>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>Index Statistics</h4></div>
          <div class="card-body">
            <p><strong>Total Indexed Files:</strong> ${stats.files}</p>
            <p><strong>Total Code Chunks:</strong> ${stats.chunks}</p>
            <p><strong>Total Extracted Symbols:</strong> ${stats.symbols}</p>
            <p><strong>Identified Routes:</strong> ${stats.routes}</p>
            <p><strong>Schema Tables:</strong> ${stats.tables}</p>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h4>Workspaces & Revisions</h4></div>
          <div class="card-body">
            ${workspaces
              .map(
                (w) => `
              <div class="mb-2">
                <strong>${escapeHtml(w.name)}</strong> (${escapeHtml(w.type)})
                <div class="text-xs text-muted mono">${w.id}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      `;

      // Wire detail action buttons
      const fullBtn = document.getElementById('pd-full-index-btn');
      const incBtn = document.getElementById('pd-inc-index-btn');
      const purgeBtn = document.getElementById('pd-purge-index-btn');

      fullBtn.onclick = async () => {
        fullBtn.disabled = true;
        fullBtn.textContent = 'Indexing...';
        try {
          await apiFetch(`/api/projects/${projectId}/index`, {
            method: 'POST',
            body: JSON.stringify({ mode: 'full' }),
          });
          alert('Full indexing initiated!');
          loadProjectDetail(projectId);
        } catch (err) {
          alert(`Indexing failed: ${err.message}`);
        } finally {
          fullBtn.disabled = false;
          fullBtn.textContent = 'Full Index';
        }
      };

      incBtn.onclick = async () => {
        incBtn.disabled = true;
        incBtn.textContent = 'Indexing...';
        try {
          await apiFetch(`/api/projects/${projectId}/index`, {
            method: 'POST',
            body: JSON.stringify({ mode: 'incremental' }),
          });
          alert('Incremental indexing initiated!');
          loadProjectDetail(projectId);
        } catch (err) {
          alert(`Indexing failed: ${err.message}`);
        } finally {
          incBtn.disabled = false;
          incBtn.textContent = 'Incremental Index';
        }
      };

      purgeBtn.onclick = async () => {
        if (!confirm(`Purge all vector & indexing records for project "${projectId}"?\nOriginal project source files will NOT be affected.`)) return;
        try {
          await apiFetch(`/api/projects/${projectId}?purgeIndexOnly=true`, { method: 'DELETE' });
          alert('Project index data purged.');
          loadProjectDetail(projectId);
        } catch (err) {
          alert(`Purge failed: ${err.message}`);
        }
      };

      // Populate Files sub-tab
      loadProjectFilesTab(projectId);
      // Populate Chunks sub-tab
      loadProjectChunksTab(projectId);
      // Populate Symbols sub-tab
      loadProjectSymbolsTab(projectId);
      // Populate Dependencies sub-tab
      loadProjectDepsTab(projectId);
      // Populate History sub-tab
      renderProjectJobsTab(jobs);
      // Populate Errors sub-tab
      renderProjectErrorsTab(errors);

      // Setup tab switcher within project detail
      setupDetailTabs();
    } catch (err) {
      console.error('Failed to load project details:', err);
    }
  }

  function setupDetailTabs() {
    const tabButtons = document.querySelectorAll('#view-project-detail .tab-btn');
    const tabPanes = document.querySelectorAll('#view-project-detail .tab-pane');

    tabButtons.forEach((btn) => {
      btn.onclick = () => {
        tabButtons.forEach((b) => b.classList.remove('active'));
        tabPanes.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      };
    });
  }

  async function loadProjectFilesTab(projectId) {
    const container = document.getElementById('pd-files-container');
    try {
      const res = await apiFetch(`/api/files?projectId=${projectId}&limit=50`);
      if (res.files.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">No indexed files found. Run indexing to scan source files.</p>';
        return;
      }
      container.innerHTML = `
        <table class="table">
          <thead>
            <tr><th>Relative Path</th><th>Language</th><th>Size</th><th>Chunks</th><th>Last Indexed</th></tr>
          </thead>
          <tbody>
            ${res.files
              .map(
                (f) => `
              <tr>
                <td><span class="mono text-xs">${escapeHtml(f.relative_path)}</span></td>
                <td><span class="badge badge-neutral">${escapeHtml(f.language)}</span></td>
                <td>${formatBytes(f.file_size_bytes)}</td>
                <td>${f.chunk_count || 0}</td>
                <td>${formatDate(f.last_indexed_at)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<p class="text-danger p-4">Error loading files: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadProjectChunksTab(projectId) {
    const container = document.getElementById('pd-chunks-container');
    try {
      const res = await apiFetch(`/api/chunks?projectId=${projectId}&limit=50`);
      if (res.chunks.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">No chunks generated yet.</p>';
        return;
      }
      container.innerHTML = `
        <table class="table">
          <thead>
            <tr><th>Symbol</th><th>Type</th><th>File</th><th>Lines</th><th>Vectors</th></tr>
          </thead>
          <tbody>
            ${res.chunks
              .map(
                (c) => `
              <tr>
                <td><strong>${escapeHtml(c.symbol_name || 'Anonymous')}</strong></td>
                <td><span class="badge badge-neutral">${escapeHtml(c.symbol_type)}</span></td>
                <td><span class="mono text-xs">${escapeHtml(c.relative_path)}</span></td>
                <td>L${c.start_line}-${c.end_line}</td>
                <td><span class="badge ${c.embedding_status === 'synced' ? 'badge-success' : 'badge-warning'}">${c.embedding_status}</span></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<p class="text-danger p-4">Error loading chunks: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadProjectSymbolsTab(projectId) {
    const container = document.getElementById('pd-symbols-container');
    try {
      const res = await apiFetch(`/api/symbols?projectId=${projectId}&limit=50`);
      if (res.symbols.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">No symbols extracted yet.</p>';
        return;
      }
      container.innerHTML = `
        <table class="table">
          <thead>
            <tr><th>Symbol Name</th><th>Kind</th><th>File</th><th>Lines</th><th>Signature</th></tr>
          </thead>
          <tbody>
            ${res.symbols
              .map(
                (s) => `
              <tr>
                <td><strong>${escapeHtml(s.name)}</strong></td>
                <td><span class="badge badge-neutral">${escapeHtml(s.kind)}</span></td>
                <td><span class="mono text-xs">${escapeHtml(s.relative_path)}</span></td>
                <td>L${s.start_line}-${s.end_line}</td>
                <td><span class="mono text-xs">${escapeHtml(s.signature || '-')}</span></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<p class="text-danger p-4">Error loading symbols: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadProjectDepsTab(projectId) {
    const container = document.getElementById('pd-deps-container');
    try {
      const res = await apiFetch(`/api/dependencies?projectId=${projectId}`);
      if (res.dependencies.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">No dependency edges identified.</p>';
        return;
      }
      container.innerHTML = `
        <table class="table">
          <thead>
            <tr><th>Source Node</th><th>Source Type</th><th>Relationship</th><th>Target Node</th><th>Target Type</th></tr>
          </thead>
          <tbody>
            ${res.dependencies
              .map(
                (d) => `
              <tr>
                <td><strong>${escapeHtml(d.source_node)}</strong></td>
                <td>${escapeHtml(d.source_type)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(d.relationship)}</span></td>
                <td><strong>${escapeHtml(d.target_node)}</strong></td>
                <td>${escapeHtml(d.target_type)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<p class="text-danger p-4">Error loading dependencies: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderProjectJobsTab(jobs) {
    const container = document.getElementById('pd-jobs-container');
    if (!jobs || jobs.length === 0) {
      container.innerHTML = '<p class="text-muted p-4">No indexing jobs recorded for this project.</p>';
      return;
    }
    container.innerHTML = `
      <table class="table">
        <thead>
          <tr><th>ID</th><th>Type</th><th>Status</th><th>Files</th><th>Chunks</th><th>Started</th><th>Duration</th></tr>
        </thead>
        <tbody>
          ${jobs
            .map(
              (j) => `
            <tr>
              <td><code>${j.id}</code></td>
              <td>${escapeHtml(j.job_type)}</td>
              <td><span class="badge ${j.status === 'completed' ? 'badge-success' : 'badge-danger'}">${j.status}</span></td>
              <td>${j.indexed_files || 0}</td>
              <td>${j.indexed_chunks || 0}</td>
              <td>${formatDate(j.started_at)}</td>
              <td>${formatDuration(j.duration_ms)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  function renderProjectErrorsTab(errors) {
    const container = document.getElementById('pd-errors-container');
    if (!errors || errors.length === 0) {
      container.innerHTML = '<p class="text-muted p-4">No errors logged for this project. System healthy.</p>';
      return;
    }
    container.innerHTML = `
      <table class="table">
        <thead>
          <tr><th>Timestamp</th><th>File</th><th>Type</th><th>Message</th></tr>
        </thead>
        <tbody>
          ${errors
            .map(
              (e) => `
            <tr>
              <td>${formatDate(e.created_at)}</td>
              <td><span class="mono text-xs">${escapeHtml(e.file_path || '-')}</span></td>
              <td><span class="badge badge-danger">${escapeHtml(e.error_type)}</span></td>
              <td>${escapeHtml(e.message)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  // ==============================================================================
  // 7. View 4: Indexed Files Management
  // ==============================================================================

  const filesSearchInput = document.getElementById('files-search-input');
  const filesProjectFilter = document.getElementById('files-project-filter');
  const filesExtFilter = document.getElementById('files-ext-filter');

  async function loadFiles() {
    const tableBody = document.querySelector('#files-table tbody');
    const paginationBar = document.getElementById('files-pagination');

    const params = new URLSearchParams({
      projectId: state.filesFilter.projectId,
      extension: state.filesFilter.extension,
      search: state.filesFilter.search,
      limit: String(state.filesFilter.limit),
      offset: String((state.filesFilter.page - 1) * state.filesFilter.limit),
    });

    try {
      const res = await apiFetch(`/api/files?${params.toString()}`);
      const { files, total, limit, offset } = res;

      if (files.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No files matched your search criteria.</td></tr>';
        paginationBar.innerHTML = '';
        return;
      }

      tableBody.innerHTML = files
        .map((f) => {
          return `
            <tr>
              <td>
                <span class="mono text-xs font-semibold">${escapeHtml(f.relative_path)}</span>
                <div class="text-xs text-muted">ID: ${f.id}</div>
              </td>
              <td><span class="badge badge-neutral">${escapeHtml(f.project_name || f.project_id)}</span></td>
              <td><code>${escapeHtml(f.language)}</code></td>
              <td>${formatBytes(f.file_size_bytes)}</td>
              <td>${f.chunk_count || 0}</td>
              <td>${formatDate(f.last_indexed_at)}</td>
              <td>
                <button class="btn btn-secondary btn-sm reindex-file-btn" data-file-id="${f.id}" title="Re-parse file">Reindex</button>
              </td>
            </tr>
          `;
        })
        .join('');

      // Wire reindex buttons
      tableBody.querySelectorAll('.reindex-file-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const fileId = btn.getAttribute('data-file-id');
          btn.disabled = true;
          btn.textContent = 'Parsing...';
          try {
            const result = await apiFetch(`/api/files/${fileId}/reindex`, { method: 'POST' });
            alert(`File reindexed! Generated ${result.chunksCount} chunks and ${result.symbolsCount} symbols.`);
            loadFiles();
          } catch (err) {
            alert(`Reindexing error: ${err.message}`);
            btn.disabled = false;
            btn.textContent = 'Reindex';
          }
        });
      });

      // Render Pagination
      renderPagination(paginationBar, total, limit, offset, (newPage) => {
        state.filesFilter.page = newPage;
        loadFiles();
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-danger">Failed to load files: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  filesSearchInput.addEventListener('input', debounce(() => {
    state.filesFilter.search = filesSearchInput.value.trim();
    state.filesFilter.page = 1;
    loadFiles();
  }, 300));

  filesProjectFilter.addEventListener('change', () => {
    state.filesFilter.projectId = filesProjectFilter.value;
    state.filesFilter.page = 1;
    loadFiles();
  });

  filesExtFilter.addEventListener('change', () => {
    state.filesFilter.extension = filesExtFilter.value;
    state.filesFilter.page = 1;
    loadFiles();
  });

  // ==============================================================================
  // 8. View 5: Code Chunks Management
  // ==============================================================================

  const chunksSearchInput = document.getElementById('chunks-search-input');
  const chunksProjectFilter = document.getElementById('chunks-project-filter');
  const chunksTypeFilter = document.getElementById('chunks-type-filter');

  async function loadChunks() {
    const tableBody = document.querySelector('#chunks-table tbody');
    const paginationBar = document.getElementById('chunks-pagination');

    const params = new URLSearchParams({
      projectId: state.chunksFilter.projectId,
      symbolType: state.chunksFilter.type,
      search: state.chunksFilter.search,
      limit: String(state.chunksFilter.limit),
      offset: String((state.chunksFilter.page - 1) * state.chunksFilter.limit),
    });

    try {
      const res = await apiFetch(`/api/chunks?${params.toString()}`);
      const { chunks, total, limit, offset } = res;

      if (chunks.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No code chunks matched your search.</td></tr>';
        paginationBar.innerHTML = '';
        return;
      }

      tableBody.innerHTML = chunks
        .map((c) => {
          return `
            <tr>
              <td>
                <strong>${escapeHtml(c.symbol_name || 'Anonymous Block')}</strong>
                ${c.parent_symbol ? `<div class="text-xs text-muted">in ${escapeHtml(c.parent_symbol)}</div>` : ''}
              </td>
              <td><span class="badge badge-neutral">${escapeHtml(c.symbol_type)}</span></td>
              <td>
                <span class="mono text-xs">${escapeHtml(c.relative_path)}</span>
                <span class="text-xs text-muted">L${c.start_line}-${c.end_line}</span>
              </td>
              <td><code>${escapeHtml(c.language)}</code></td>
              <td><span class="code-preview">${escapeHtml(c.preview || '').substring(0, 80)}...</span></td>
              <td><span class="badge ${c.embedding_status === 'synced' ? 'badge-success' : 'badge-warning'}">${c.embedding_status}</span></td>
              <td>
                <button class="btn btn-secondary btn-sm inspect-chunk-btn" data-chunk-id="${c.id}">Inspect</button>
              </td>
            </tr>
          `;
        })
        .join('');

      tableBody.querySelectorAll('.inspect-chunk-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const chunkId = btn.getAttribute('data-chunk-id');
          openChunkModal(chunkId);
        });
      });

      renderPagination(paginationBar, total, limit, offset, (newPage) => {
        state.chunksFilter.page = newPage;
        loadChunks();
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-danger">Failed to load chunks: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  chunksSearchInput.addEventListener('input', debounce(() => {
    state.chunksFilter.search = chunksSearchInput.value.trim();
    state.chunksFilter.page = 1;
    loadChunks();
  }, 300));

  chunksProjectFilter.addEventListener('change', () => {
    state.chunksFilter.projectId = chunksProjectFilter.value;
    state.chunksFilter.page = 1;
    loadChunks();
  });

  chunksTypeFilter.addEventListener('change', () => {
    state.chunksFilter.type = chunksTypeFilter.value;
    state.chunksFilter.page = 1;
    loadChunks();
  });

  // Chunk Modal
  const chunkModal = document.getElementById('chunk-modal');
  const closeChunkModalBtn = document.getElementById('close-chunk-modal');
  const closeChunkBtn = document.getElementById('close-chunk-btn');

  async function openChunkModal(chunkId) {
    try {
      const res = await apiFetch(`/api/chunks/${chunkId}`);
      const chunk = res.chunk;

      document.getElementById('chunk-modal-title').textContent = `Chunk: ${chunk.symbol_name || 'Anonymous Block'}`;
      document.getElementById('chunk-meta').innerHTML = `
        <span><strong>File:</strong> <code>${escapeHtml(chunk.relative_path)}</code></span>
        <span><strong>Lines:</strong> L${chunk.start_line} - L${chunk.end_line}</span>
        <span><strong>Language:</strong> ${chunk.language}</span>
        <span><strong>Embedding:</strong> ${chunk.embedding_status}</span>
        <span><strong>Chunk ID:</strong> <code>${chunk.chunk_id}</code></span>
      `;
      document.getElementById('chunk-content-code').textContent = chunk.content;

      chunkModal.classList.remove('hidden');
    } catch (err) {
      alert(`Could not load chunk details: ${err.message}`);
    }
  }

  function closeChunkModal() {
    chunkModal.classList.add('hidden');
  }

  closeChunkModalBtn.addEventListener('click', closeChunkModal);
  closeChunkBtn.addEventListener('click', closeChunkModal);

  // ==============================================================================
  // 9. View 6: Symbols Management
  // ==============================================================================

  const symbolsSearchInput = document.getElementById('symbols-search-input');
  const symbolsProjectFilter = document.getElementById('symbols-project-filter');
  const symbolsKindFilter = document.getElementById('symbols-kind-filter');

  async function loadSymbols() {
    const tableBody = document.querySelector('#symbols-table tbody');
    const paginationBar = document.getElementById('symbols-pagination');

    const params = new URLSearchParams({
      projectId: state.symbolsFilter.projectId,
      kind: state.symbolsFilter.kind,
      search: state.symbolsFilter.search,
      limit: String(state.symbolsFilter.limit),
      offset: String((state.symbolsFilter.page - 1) * state.symbolsFilter.limit),
    });

    try {
      const res = await apiFetch(`/api/symbols?${params.toString()}`);
      const { symbols, total, limit, offset } = res;

      if (symbols.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No symbols found.</td></tr>';
        paginationBar.innerHTML = '';
        return;
      }

      tableBody.innerHTML = symbols
        .map((s) => {
          return `
            <tr>
              <td>
                <strong>${escapeHtml(s.name)}</strong>
                ${s.visibility ? `<span class="badge badge-neutral text-xs ml-1">${s.visibility}</span>` : ''}
              </td>
              <td><span class="badge badge-neutral">${escapeHtml(s.kind)}</span></td>
              <td><span class="text-muted">${escapeHtml(s.namespace_or_module || s.parent_symbol || '-')}</span></td>
              <td><span class="mono text-xs">${escapeHtml(s.relative_path)}</span></td>
              <td>L${s.start_line}-${s.end_line}</td>
              <td><span class="mono text-xs">${escapeHtml(s.signature || '-')}</span></td>
            </tr>
          `;
        })
        .join('');

      renderPagination(paginationBar, total, limit, offset, (newPage) => {
        state.symbolsFilter.page = newPage;
        loadSymbols();
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load symbols: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  symbolsSearchInput.addEventListener('input', debounce(() => {
    state.symbolsFilter.search = symbolsSearchInput.value.trim();
    state.symbolsFilter.page = 1;
    loadSymbols();
  }, 300));

  symbolsProjectFilter.addEventListener('change', () => {
    state.symbolsFilter.projectId = symbolsProjectFilter.value;
    state.symbolsFilter.page = 1;
    loadSymbols();
  });

  symbolsKindFilter.addEventListener('change', () => {
    state.symbolsFilter.kind = symbolsKindFilter.value;
    state.symbolsFilter.page = 1;
    loadSymbols();
  });

  // ==============================================================================
  // 10. View 7: Dependencies Graph
  // ==============================================================================

  const depsSearchInput = document.getElementById('deps-search-input');
  const depsProjectFilter = document.getElementById('deps-project-filter');

  async function loadDependencies() {
    const tableBody = document.querySelector('#deps-table tbody');
    const params = new URLSearchParams({
      projectId: state.depsFilter.projectId,
      search: state.depsFilter.search,
    });

    try {
      const res = await apiFetch(`/api/dependencies?${params.toString()}`);
      const { dependencies } = res;

      if (dependencies.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No dependency graph edges extracted yet.</td></tr>';
        return;
      }

      tableBody.innerHTML = dependencies
        .map((d) => {
          return `
            <tr>
              <td><strong>${escapeHtml(d.source_node)}</strong></td>
              <td><span class="badge badge-neutral">${escapeHtml(d.source_type)}</span></td>
              <td><span class="badge badge-success">${escapeHtml(d.relationship)}</span></td>
              <td><strong>${escapeHtml(d.target_node)}</strong></td>
              <td><span class="badge badge-neutral">${escapeHtml(d.target_type)}</span></td>
              <td><span class="badge badge-neutral">Resolved</span></td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load dependencies: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  depsSearchInput.addEventListener('input', debounce(() => {
    state.depsFilter.search = depsSearchInput.value.trim();
    loadDependencies();
  }, 300));

  depsProjectFilter.addEventListener('change', () => {
    state.depsFilter.projectId = depsProjectFilter.value;
    loadDependencies();
  });

  // ==============================================================================
  // 11. View 8: Indexing Management
  // ==============================================================================

  async function loadIndexingJobs() {
    const tableBody = document.querySelector('#indexing-jobs-table tbody');
    try {
      const res = await apiFetch('/api/indexing/jobs');
      const { jobs } = res;

      if (jobs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No indexing jobs recorded.</td></tr>';
        return;
      }

      tableBody.innerHTML = jobs
        .map((j) => {
          const statusBadge =
            j.status === 'completed'
              ? 'badge-success'
              : j.status === 'running'
              ? 'badge-warning'
              : 'badge-danger';

          return `
            <tr>
              <td><code>${j.id}</code></td>
              <td><strong>${escapeHtml(j.project_name || j.project_id)}</strong></td>
              <td><span class="badge badge-neutral">${escapeHtml(j.job_type)}</span></td>
              <td><span class="badge ${statusBadge}">${j.status}</span></td>
              <td>${j.total_files || 0}</td>
              <td>${j.indexed_files || 0}</td>
              <td>${j.indexed_chunks || 0}</td>
              <td>${j.generated_embeddings || 0}</td>
              <td>${formatDate(j.started_at)}</td>
              <td>${formatDuration(j.duration_ms)}</td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="10" class="text-danger">Failed to load indexing history: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  const triggerIndexForm = document.getElementById('trigger-index-form');
  triggerIndexForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const projectId = document.getElementById('idx-project-select').value;
    const mode = document.getElementById('idx-mode-select').value;
    const btn = document.getElementById('trigger-index-btn');

    if (!projectId) {
      alert('Please select a project');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Starting Job...';

    try {
      await apiFetch(`/api/projects/${projectId}/index`, {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });
      alert(`Indexing job completed successfully for project ${projectId}!`);
      loadIndexingJobs();
    } catch (err) {
      alert(`Indexing error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Start Indexing';
    }
  });

  // ==============================================================================
  // 12. View 9: AI Model Providers
  // ==============================================================================

  async function loadAIProviders() {
    const tableBody = document.querySelector('#providers-table tbody');
    try {
      const res = await apiFetch('/api/ai/providers');
      const { providers } = res;

      if (providers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No AI providers configured. Click "Add Provider" above.</td></tr>';
        return;
      }

      tableBody.innerHTML = providers
        .map((p) => {
          return `
            <tr>
              <td><strong>${escapeHtml(p.name)}</strong></td>
              <td><span class="badge badge-neutral">${escapeHtml(p.type)}</span></td>
              <td><span class="mono text-xs">${escapeHtml(p.masked_api_key || 'No key required')}</span></td>
              <td><span class="mono text-xs">${escapeHtml(p.base_url || '-')}</span></td>
              <td><code>${escapeHtml(p.default_model || '-')}</code></td>
              <td><span class="badge ${p.is_enabled ? 'badge-success' : 'badge-neutral'}">${p.is_enabled ? 'Active' : 'Disabled'}</span></td>
              <td>
                <div class="action-btn-group">
                  <button class="btn btn-secondary btn-sm test-prov-table-btn" data-prov-id="${p.id}">Test</button>
                  <button class="btn btn-secondary btn-sm edit-prov-table-btn" data-prov-id="${p.id}">Edit</button>
                  <button class="btn btn-danger btn-sm del-prov-table-btn" data-prov-id="${p.id}">Delete</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('');

      tableBody.querySelectorAll('.test-prov-table-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const provId = btn.getAttribute('data-prov-id');
          btn.disabled = true;
          btn.textContent = 'Testing...';
          try {
            const result = await apiFetch(`/api/ai/providers/${provId}/test`, { method: 'POST', body: JSON.stringify({}) });
            if (result.ok) {
              alert(`Connection OK! Latency: ${result.latencyMs}ms\nModel tested: ${result.modelTested}`);
            } else {
              alert(`Connection Test Failed: ${result.error}`);
            }
          } catch (err) {
            alert(`Test error: ${err.message}`);
          } finally {
            btn.disabled = false;
            btn.textContent = 'Test';
          }
        });
      });

      tableBody.querySelectorAll('.edit-prov-table-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const provId = btn.getAttribute('data-prov-id');
          const prov = providers.find((x) => x.id === provId);
          if (prov) openProviderModal(prov);
        });
      });

      tableBody.querySelectorAll('.del-prov-table-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const provId = btn.getAttribute('data-prov-id');
          if (!confirm(`Delete provider "${provId}"?`)) return;
          try {
            await apiFetch(`/api/ai/providers/${provId}`, { method: 'DELETE' });
            loadAIProviders();
          } catch (err) {
            alert(`Error deleting provider: ${err.message}`);
          }
        });
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-danger">Failed to load AI providers: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadModelAssignments() {
    const grid = document.getElementById('assignment-grid');
    try {
      const [assignRes, provRes] = await Promise.all([
        apiFetch('/api/ai/assignments'),
        apiFetch('/api/ai/providers'),
      ]);

      const assignments = assignRes.assignments || [];
      const providers = provRes.providers || [];

      const taskLabels = {
        code_analysis: 'Code Structure & AST Analysis',
        context_ranking: 'Context Relevance Scoring',
        query_reformulation: 'Developer Query Expansion',
        architectural_reasoning: 'Multi-file Architectural Impact',
      };

      grid.innerHTML = Object.entries(taskLabels)
        .map(([taskKey, taskTitle]) => {
          const current = assignments.find((a) => a.task_type === taskKey) || {};
          const currentProvId = current.provider_id || '';
          const currentModel = current.model_name || '';

          const provOptions = providers
            .map((p) => `<option value="${p.id}" ${p.id === currentProvId ? 'selected' : ''}>${escapeHtml(p.name)} (${p.type})</option>`)
            .join('');

          return `
            <div class="assignment-card" data-task="${taskKey}">
              <h4>${taskTitle}</h4>
              <div class="text-xs text-muted mb-2 mono">task: ${taskKey}</div>
              <div class="form-group">
                <label>Assigned Provider</label>
                <select class="form-control assign-prov-select">
                  <option value="">-- System Default --</option>
                  ${provOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Model Override (optional)</label>
                <input type="text" class="form-control assign-model-input" value="${escapeHtml(currentModel)}" placeholder="e.g. gpt-4o-mini">
              </div>
            </div>
          `;
        })
        .join('');
    } catch (err) {
      grid.innerHTML = `<p class="text-danger">Failed to load assignments: ${escapeHtml(err.message)}</p>`;
    }
  }

  const modelAssignmentsForm = document.getElementById('model-assignments-form');
  modelAssignmentsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cards = document.querySelectorAll('.assignment-card');

    try {
      for (const card of cards) {
        const taskType = card.getAttribute('data-task');
        const providerId = card.querySelector('.assign-prov-select').value || null;
        const modelName = card.querySelector('.assign-model-input').value.trim() || null;

        await apiFetch('/api/ai/assignments', {
          method: 'PUT',
          body: JSON.stringify({ taskType, providerId, modelName }),
        });
      }
      alert('Task-specific model assignments saved successfully!');
    } catch (err) {
      alert(`Failed to save model assignments: ${err.message}`);
    }
  });

  // AI Provider Modal
  const provModal = document.getElementById('provider-modal');
  const openProvModalBtn = document.getElementById('open-provider-modal-btn');
  const closeProvModalBtn = document.getElementById('close-provider-modal');
  const provForm = document.getElementById('provider-form');
  const testProvBtn = document.getElementById('test-prov-btn');
  const provTestFeedback = document.getElementById('prov-test-feedback');

  function openProviderModal(existing = null) {
    provTestFeedback.classList.add('hidden');
    provForm.reset();

    if (existing) {
      state.currentEditingProviderId = existing.id;
      document.getElementById('provider-modal-title').textContent = 'Edit AI Provider';
      document.getElementById('prov-id').value = existing.id;
      document.getElementById('prov-name').value = existing.name;
      document.getElementById('prov-type').value = existing.type;
      document.getElementById('prov-url').value = existing.base_url || '';
      document.getElementById('prov-model').value = existing.default_model || '';
      document.getElementById('prov-enabled').checked = Boolean(existing.is_enabled);
      document.getElementById('prov-key-hint').textContent = 'Leave blank to preserve the existing encrypted API key.';
    } else {
      state.currentEditingProviderId = null;
      document.getElementById('provider-modal-title').textContent = 'Configure AI Provider';
      document.getElementById('prov-id').value = '';
      document.getElementById('prov-key-hint').textContent = 'Key is encrypted using AES-256-GCM before storage.';
    }

    provModal.classList.remove('hidden');
  }

  function closeProviderModal() {
    provModal.classList.add('hidden');
  }

  openProvModalBtn.addEventListener('click', () => openProviderModal(null));
  closeProvModalBtn.addEventListener('click', closeProviderModal);

  testProvBtn.addEventListener('click', async () => {
    provTestFeedback.classList.remove('hidden', 'alert-success', 'alert-danger');
    provTestFeedback.classList.add('alert-info');
    provTestFeedback.textContent = 'Testing connection to provider...';

    const providerId = state.currentEditingProviderId;
    const type = document.getElementById('prov-type').value;
    const apiKey = document.getElementById('prov-key').value;
    const baseUrl = document.getElementById('prov-url').value;
    const defaultModel = document.getElementById('prov-model').value;

    try {
      const endpoint = providerId ? `/api/ai/providers/${providerId}/test` : '/api/ai/providers/test';
      const result = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ type, apiKey, baseUrl, defaultModel }),
      });

      provTestFeedback.classList.remove('alert-info');
      if (result.ok) {
        provTestFeedback.classList.add('alert-success');
        provTestFeedback.textContent = `✔ Connected! Latency: ${result.latencyMs}ms. Model: ${result.modelTested}`;
      } else {
        provTestFeedback.classList.add('alert-danger');
        provTestFeedback.textContent = `✖ Connection failed: ${result.error}`;
      }
    } catch (err) {
      provTestFeedback.classList.remove('alert-info');
      provTestFeedback.classList.add('alert-danger');
      provTestFeedback.textContent = `✖ Test error: ${err.message}`;
    }
  });

  provForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('prov-id').value || undefined;
    const name = document.getElementById('prov-name').value.trim();
    const type = document.getElementById('prov-type').value;
    const apiKey = document.getElementById('prov-key').value || undefined;
    const baseUrl = document.getElementById('prov-url').value.trim() || undefined;
    const defaultModel = document.getElementById('prov-model').value.trim() || undefined;
    const isEnabled = document.getElementById('prov-enabled').checked;

    try {
      await apiFetch('/api/ai/providers', {
        method: 'POST',
        body: JSON.stringify({ id, name, type, apiKey, baseUrl, defaultModel, isEnabled }),
      });

      closeProviderModal();
      loadAIProviders();
      loadModelAssignments();
    } catch (err) {
      alert(`Error saving provider: ${err.message}`);
    }
  });

  // ==============================================================================
  // 13. View 10: Embedding Settings
  // ==============================================================================

  const embeddingSettingsForm = document.getElementById('embedding-settings-form');
  const embReindexWarning = document.getElementById('emb-reindex-warning');

  async function loadEmbeddingSettings() {
    try {
      const res = await apiFetch('/api/ai/embedding-settings');
      const { settings } = res;

      document.getElementById('emb-provider').value = settings.provider || 'ollama';
      document.getElementById('emb-model').value = settings.model_name || 'nomic-embed-text';
      document.getElementById('emb-dimensions').value = settings.dimensions || 768;
      document.getElementById('emb-batch-size').value = settings.batch_size || 32;

      document.getElementById('emb-model').addEventListener('input', () => {
        embReindexWarning.classList.remove('hidden');
      });
      document.getElementById('emb-dimensions').addEventListener('input', () => {
        embReindexWarning.classList.remove('hidden');
      });
    } catch (err) {
      console.error('Failed to load embedding settings:', err);
    }
  }

  embeddingSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const provider = document.getElementById('emb-provider').value;
    const modelName = document.getElementById('emb-model').value.trim();
    const dimensions = Number(document.getElementById('emb-dimensions').value);
    const batchSize = Number(document.getElementById('emb-batch-size').value);

    try {
      const result = await apiFetch('/api/ai/embedding-settings', {
        method: 'PUT',
        body: JSON.stringify({ provider, modelName, dimensions, batchSize }),
      });

      if (result.reindexRequired) {
        alert('Embedding settings updated! Note: You must trigger a Full Index on existing projects to rebuild vector points with the new dimensions.');
      } else {
        alert('Embedding settings saved successfully.');
      }
    } catch (err) {
      alert(`Error updating embedding settings: ${err.message}`);
    }
  });

  // ==============================================================================
  // 14. View 11: System Settings & Diagnostics
  // ==============================================================================

  async function loadSystemSettings() {
    const container = document.getElementById('system-cards-container');
    try {
      const res = await apiFetch('/api/system/settings');
      const { mysql, qdrant, ollama, mcp, storage } = res;

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h4>MySQL 8.4 Relational Database</h4>
            <span class="badge ${mysql.connected ? 'badge-success' : 'badge-danger'}">${mysql.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div class="card-body">
            <p><strong>Host:</strong> ${escapeHtml(mysql.host)}:${mysql.port}</p>
            <p><strong>Database:</strong> <code>${escapeHtml(mysql.database)}</code></p>
            <p><strong>User:</strong> ${escapeHtml(mysql.user)}</p>
            <p><strong>Server Version:</strong> ${escapeHtml(mysql.version || 'Unknown')}</p>
            ${mysql.error ? `<div class="alert alert-danger mt-2">${escapeHtml(mysql.error)}</div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h4>Qdrant Vector Database</h4>
            <span class="badge ${qdrant.connected ? 'badge-success' : 'badge-danger'}">${qdrant.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div class="card-body">
            <p><strong>Endpoint:</strong> <code>${escapeHtml(qdrant.url)}</code></p>
            <p><strong>Active Collections:</strong> ${qdrant.collections ? qdrant.collections.length : 0}</p>
            <div class="mono text-xs mt-2 text-muted">
              ${(qdrant.collections || []).map((c) => `<div>• ${escapeHtml(c)}</div>`).join('')}
            </div>
            ${qdrant.error ? `<div class="alert alert-danger mt-2">${escapeHtml(qdrant.error)}</div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h4>Ollama Local Embeddings</h4>
            <span class="badge ${ollama.connected ? 'badge-success' : 'badge-danger'}">${ollama.connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div class="card-body">
            <p><strong>Endpoint:</strong> <code>${escapeHtml(ollama.url)}</code></p>
            <p><strong>Default Model:</strong> <code>${escapeHtml(ollama.model)}</code> (${ollama.dimensions} dims)</p>
            <p><strong>Model Available:</strong> ${ollama.modelAvailable ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-warning">Missing / Pulling needed</span>'}</p>
            <div class="mt-2 text-xs text-muted">
              <strong>Installed Models:</strong>
              ${(ollama.availableModels || []).map((m) => `<div class="mono">• ${escapeHtml(m)}</div>`).join('')}
            </div>
            ${ollama.error ? `<div class="alert alert-danger mt-2">${escapeHtml(ollama.error)}</div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h4>Model Context Protocol (MCP)</h4>
            <span class="badge badge-success">Ready</span>
          </div>
          <div class="card-body">
            <p><strong>Server Name:</strong> <code>${escapeHtml(mcp.serverName)}</code></p>
            <p><strong>Protocol Version:</strong> ${escapeHtml(mcp.version)}</p>
            <p><strong>Transport:</strong> <code>stdio</code></p>
            <p><strong>Registered Tools:</strong></p>
            <div class="mono text-xs text-muted">
              ${(mcp.tools || []).map((t) => `<div>• ${escapeHtml(t)}</div>`).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h4>Local App Storage</h4>
          </div>
          <div class="card-body">
            <p><strong>Base Data Directory:</strong> <span class="mono text-xs">${escapeHtml(storage.dataDir)}</span></p>
            <p><strong>Logs Directory:</strong> <span class="mono text-xs">${escapeHtml(storage.logsDir)}</span></p>
            <p><strong>Cache Directory:</strong> <span class="mono text-xs">${escapeHtml(storage.cacheDir)}</span></p>
            <p><strong>Status:</strong> ${storage.dataDirExists ? '<span class="badge badge-success">Initialized</span>' : '<span class="badge badge-warning">Pending</span>'}</p>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p class="text-danger">Failed to load system settings: ${escapeHtml(err.message)}</p>`;
    }
  }

  // ==============================================================================
  // 15. View 12: Logs & Diagnostics
  // ==============================================================================

  async function loadLogs() {
    const errorTable = document.querySelector('#error-logs-table tbody');
    const retrievalTable = document.querySelector('#retrieval-logs-table tbody');

    try {
      const res = await apiFetch('/api/logs');
      const { errors, retrievals } = res;

      if (!errors || errors.length === 0) {
        errorTable.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No error logs recorded.</td></tr>';
      } else {
        errorTable.innerHTML = errors
          .map((e) => {
            return `
              <tr>
                <td>${formatDate(e.created_at)}</td>
                <td><strong>${escapeHtml(e.project_id || '-')}</strong></td>
                <td><span class="mono text-xs">${escapeHtml(e.file_path || '-')}</span></td>
                <td><span class="badge badge-danger">${escapeHtml(e.error_type)}</span></td>
                <td>${escapeHtml(e.message)}</td>
                <td><pre class="code-preview">${escapeHtml(e.stack_trace || '').substring(0, 100)}</pre></td>
              </tr>
            `;
          })
          .join('');
      }

      if (!retrievals || retrievals.length === 0) {
        retrievalTable.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No RAG retrieval queries recorded yet.</td></tr>';
      } else {
        retrievalTable.innerHTML = retrievals
          .map((r) => {
            return `
              <tr>
                <td>${formatDate(r.created_at)}</td>
                <td><strong>${escapeHtml(r.project_id || 'global')}</strong></td>
                <td><code>${escapeHtml(r.query_text)}</code></td>
                <td>${r.execution_time_ms}ms</td>
                <td>${r.results_count || 0} chunks returned</td>
              </tr>
            `;
          })
          .join('');
      }
    } catch (err) {
      errorTable.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load logs: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  document.getElementById('refresh-logs-btn').addEventListener('click', loadLogs);

  // ==============================================================================
  // 16. Utility Helpers (Pagination, Debounce)
  // ==============================================================================

  function renderPagination(container, total, limit, offset, onPageChange) {
    if (!container) return;
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit) || 1;

    if (totalPages <= 1) {
      container.innerHTML = `<span class="pagination-info">Showing ${total} items</span>`;
      return;
    }

    container.innerHTML = `
      <span class="pagination-info">Page ${currentPage} of ${totalPages} (${total} total items)</span>
      <div class="pagination-buttons">
        <button class="btn btn-secondary btn-sm" id="pg-prev" ${currentPage <= 1 ? 'disabled' : ''}>← Previous</button>
        <button class="btn btn-secondary btn-sm" id="pg-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>
      </div>
    `;

    const prevBtn = container.querySelector('#pg-prev');
    const nextBtn = container.querySelector('#pg-next');

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (currentPage > 1) onPageChange(currentPage - 1);
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (currentPage < totalPages) onPageChange(currentPage + 1);
      };
    }
  }

  function debounce(fn, waitMs) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  // ==============================================================================
  // 17. Application Initialization
  // ==============================================================================

  checkAuth();
})();

