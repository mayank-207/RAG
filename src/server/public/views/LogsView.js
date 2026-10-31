/**
 * View 12: Logs & Errors View Component
 */
export function renderLogsView() {
  return `
    <section id="view-logs" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Error Logs & Diagnostics</h2>
          <p class="panel-sub">Review indexing exceptions, parser errors, and retrieval diagnostics</p>
        </div>
        <button id="refresh-logs-btn" class="btn btn-secondary btn-sm">Refresh Logs</button>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <h3>Recent Error Logs</h3>
        </div>
        <div class="card-body p-0">
          <table class="table" id="error-logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Project</th>
                <th>File</th>
                <th>Type</th>
                <th>Message</th>
                <th>Stack Trace</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" class="text-center text-muted">Loading logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Recent RAG Retrieval Queries</h3>
        </div>
        <div class="card-body p-0">
          <table class="table" id="retrieval-logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Project</th>
                <th>Query Text</th>
                <th>Execution Time</th>
                <th>Results Details</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="5" class="text-center text-muted">Loading logs...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

