/**
 * View 7: Dependencies Graph View Component
 */
export function renderDependenciesView() {
  return `
    <section id="view-dependencies" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Dependency & Impact Graph</h2>
          <p class="panel-sub">Extracted caller-callee, route-controller, model-table, and import linkages</p>
        </div>
        <div class="filter-group">
          <input type="text" id="deps-search-input" class="form-control" placeholder="Search source or target...">
          <select id="deps-project-filter" class="form-control">
            <option value="">All Projects</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table" id="deps-table">
            <thead>
              <tr>
                <th>Source Node</th>
                <th>Source Type</th>
                <th>Relationship</th>
                <th>Target Node</th>
                <th>Target Type</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" class="text-center text-muted">Loading dependencies...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

