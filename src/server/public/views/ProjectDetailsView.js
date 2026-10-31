/**
 * View 3: Project Details View Component (7 Sub-tabs)
 */
export function renderProjectDetailsView() {
  return `
    <section id="view-project-detail" class="view-panel">
      <div class="panel-header">
        <div class="detail-header-meta">
          <a href="#projects" class="btn btn-ghost btn-sm mb-2">← Back to Projects</a>
          <h2 id="pd-name">Project Details</h2>
          <span class="mono text-muted" id="pd-path">/path</span>
        </div>
        <div class="detail-header-actions">
          <button class="btn btn-primary btn-sm" id="pd-full-index-btn">Full Index</button>
          <button class="btn btn-secondary btn-sm" id="pd-inc-index-btn">Incremental Index</button>
          <button class="btn btn-danger btn-sm" id="pd-purge-index-btn">Purge Index Data</button>
        </div>
      </div>

      <!-- Project Detail Tabs -->
      <div class="tabs-nav">
        <button class="tab-btn active" data-tab="pd-tab-overview">Overview</button>
        <button class="tab-btn" data-tab="pd-tab-files">Files</button>
        <button class="tab-btn" data-tab="pd-tab-chunks">Chunks</button>
        <button class="tab-btn" data-tab="pd-tab-symbols">Symbols</button>
        <button class="tab-btn" data-tab="pd-tab-deps">Dependencies</button>
        <button class="tab-btn" data-tab="pd-tab-jobs">Indexing History</button>
        <button class="tab-btn" data-tab="pd-tab-errors">Errors & Logs</button>
      </div>

      <div class="tabs-content">
        <div id="pd-tab-overview" class="tab-pane active">
          <div class="overview-grid" id="pd-overview-content">
            <!-- Populated dynamically -->
          </div>
        </div>
        <div id="pd-tab-files" class="tab-pane">
          <div class="table-container" id="pd-files-container">Loading files...</div>
        </div>
        <div id="pd-tab-chunks" class="tab-pane">
          <div class="table-container" id="pd-chunks-container">Loading chunks...</div>
        </div>
        <div id="pd-tab-symbols" class="tab-pane">
          <div class="table-container" id="pd-symbols-container">Loading symbols...</div>
        </div>
        <div id="pd-tab-deps" class="tab-pane">
          <div class="table-container" id="pd-deps-container">Loading dependencies...</div>
        </div>
        <div id="pd-tab-jobs" class="tab-pane">
          <div class="table-container" id="pd-jobs-container">Loading history...</div>
        </div>
        <div id="pd-tab-errors" class="tab-pane">
          <div class="table-container" id="pd-errors-container">Loading errors...</div>
        </div>
      </div>
    </section>
  `;
}
