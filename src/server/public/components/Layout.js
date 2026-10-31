/**
 * Layout Component (Sidebar, Topbar, and App Shell)
 * Provides reusable shell navigation for the admin dashboard.
 */

export const NAV_ITEMS = [
  { section: 'CORE' },
  { id: 'dashboard', label: 'Dashboard', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
  { id: 'projects', label: 'Projects', icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' },
  { section: 'CODE EXPLORER' },
  { id: 'files', label: 'Indexed Files', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  { id: 'chunks', label: 'Code Chunks', icon: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>' },
  { id: 'symbols', label: 'Symbols', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>' },
  { id: 'dependencies', label: 'Dependencies', icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>' },
  { section: 'ENGINE & AI' },
  { id: 'indexing', label: 'Indexing Management', icon: '<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>' },
  { id: 'ai-models', label: 'AI Model Providers', icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  { id: 'embedding-settings', label: 'Embedding Settings', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>' },
  { section: 'SYSTEM' },
  { id: 'system', label: 'System Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  { id: 'logs', label: 'Logs & Errors', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' },
  { id: 'docs', label: 'Documentation', icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
];

export function renderLayoutShell() {
  return `
    <div id="app-shell" class="app-layout hidden">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="brand-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span class="brand-title">code-context-mcp</span>
          </div>
          <span class="version-tag">v1.0</span>
        </div>

        <nav class="sidebar-nav">
          ${NAV_ITEMS.map((item) => {
            if (item.section) {
              return `<div class="nav-section-label">${item.section}</div>`;
            }
            return `
              <a href="#${item.id}" class="nav-item" data-view="${item.id}">
                <span class="nav-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg></span>
                <span>${item.label}</span>
              </a>
            `;
          }).join('')}
        </nav>

        <div class="sidebar-footer">
          <div class="user-profile">
            <div class="user-avatar" id="user-avatar">AD</div>
            <div class="user-info">
              <span class="user-name" id="user-display-name">admin</span>
              <span class="user-role">Administrator</span>
            </div>
          </div>
          <button class="logout-btn" id="logout-btn" title="Sign Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="main-content">
        <!-- Topbar -->
        <header class="topbar">
          <div class="topbar-left">
            <h1 class="page-title" id="page-title">Dashboard</h1>
          </div>
          <div class="topbar-right">
            <div class="status-indicator">
              <span class="status-dot dot-neutral" id="badge-mysql"></span>
              <span class="status-text">MySQL 8.4</span>
            </div>
            <div class="status-indicator">
              <span class="status-dot dot-neutral" id="badge-qdrant"></span>
              <span class="status-text">Qdrant</span>
            </div>
            <div class="status-indicator">
              <span class="status-dot dot-neutral" id="badge-ollama"></span>
              <span class="status-text">Ollama</span>
            </div>
            <div class="status-indicator">
              <span class="status-dot dot-success" id="badge-mcp"></span>
              <span class="status-text">MCP stdio</span>
            </div>
            <button class="btn btn-sm btn-secondary" id="refresh-global-btn" title="Refresh metrics">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              Refresh
            </button>
          </div>
        </header>

        <!-- Views Container (Dynamic Views Rendered Here) -->
        <div id="views-container"></div>
      </main>
    </div>
  `;
}
