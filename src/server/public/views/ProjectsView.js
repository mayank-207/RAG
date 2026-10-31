/**
 * View 2: Projects View Component
 */
export function renderProjectsView() {
  return `
    <section id="view-projects" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Projects Management</h2>
          <p class="panel-sub">Register, inspect, and trigger indexing on your local codebases</p>
        </div>
        <button id="open-register-modal-btn" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Register New Project
        </button>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table" id="projects-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Path</th>
                <th>Framework</th>
                <th>Branch</th>
                <th>Files</th>
                <th>Chunks</th>
                <th>Last Indexed</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

