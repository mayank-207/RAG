/**
 * View 1: Dashboard View Component
 */
export function renderDashboardView() {
  return `
    <section id="view-dashboard" class="view-panel active">
      <!-- Summary Cards Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="stat-meta">
            <span class="stat-label">Registered Projects</span>
            <span class="stat-value" id="stat-total-projects">-</span>
            <span class="stat-sub" id="stat-connected-projects">Connected: -</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="stat-meta">
            <span class="stat-label">Indexed Projects</span>
            <span class="stat-value" id="stat-indexed-projects">-</span>
            <span class="stat-sub" id="stat-pending-projects">Pending: -</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            </svg>
          </div>
          <div class="stat-meta">
            <span class="stat-label">Indexed Files</span>
            <span class="stat-value" id="stat-total-files">-</span>
            <span class="stat-sub">Across all workspaces</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon orange">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
          </div>
          <div class="stat-meta">
            <span class="stat-label">Code Chunks</span>
            <span class="stat-value" id="stat-total-chunks">-</span>
            <span class="stat-sub" id="stat-total-embeddings">Embeddings: -</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon cyan">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
          </div>
          <div class="stat-meta">
            <span class="stat-label">Extracted Symbols</span>
            <span class="stat-value" id="stat-total-symbols">-</span>
            <span class="stat-sub">Classes, methods & routes</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon yellow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/>
            </svg>
          </div>
          <div class="stat-meta">
            <span class="stat-label">Last Successful Index</span>
            <span class="stat-value text-sm" id="stat-last-index">Never</span>
            <span class="stat-sub" id="stat-active-model">AI Model: -</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions & Status -->
      <div class="dashboard-split">
        <div class="card flex-1">
          <div class="card-header">
            <h3>Registered Codebases</h3>
            <a href="#projects" class="btn btn-secondary btn-sm">View All</a>
          </div>
          <div class="card-body p-0">
            <table class="table" id="dashboard-projects-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Framework</th>
                  <th>Files</th>
                  <th>Chunks</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="6" class="text-center text-muted">Loading projects...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card flex-1">
          <div class="card-header">
            <h3>System Service Diagnostics</h3>
            <button class="btn btn-secondary btn-sm" id="refresh-services-btn">Check</button>
          </div>
          <div class="card-body">
            <div class="service-check-list" id="dashboard-services-list">
              <!-- Populated dynamically -->
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

