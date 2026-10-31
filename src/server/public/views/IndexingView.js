/**
 * View 8: Indexing Management View Component
 */
export function renderIndexingView() {
  return `
    <section id="view-indexing" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Indexing Management</h2>
          <p class="panel-sub">Monitor active jobs, historical durations, and trigger index rebuilds</p>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <h3>Trigger Indexing Job</h3>
        </div>
        <div class="card-body">
          <form id="trigger-index-form" class="inline-form">
            <div class="form-group flex-1">
              <label for="idx-project-select">Select Project</label>
              <select id="idx-project-select" class="form-control" required></select>
            </div>
            <div class="form-group flex-1">
              <label for="idx-mode-select">Indexing Mode</label>
              <select id="idx-mode-select" class="form-control">
                <option value="incremental">Incremental (Only modified & new files - Fast)</option>
                <option value="full">Full Rebuild (Scan and parse all files)</option>
              </select>
            </div>
            <div class="form-group align-end">
              <button type="submit" class="btn btn-primary" id="trigger-index-btn">Start Indexing</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Indexing Jobs History</h3>
        </div>
        <div class="card-body p-0">
          <table class="table" id="indexing-jobs-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Project</th>
                <th>Type</th>
                <th>Status</th>
                <th>Scanned</th>
                <th>Indexed</th>
                <th>Chunks</th>
                <th>Vectors</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="10" class="text-center text-muted">Loading jobs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

