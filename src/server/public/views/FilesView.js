/**
 * View 4: Indexed Files View Component
 */
export function renderFilesView() {
  return `
    <section id="view-files" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Indexed Files Management</h2>
          <p class="panel-sub">Inspect, filter, and reindex individual source files</p>
        </div>
        <div class="filter-group">
          <input type="text" id="files-search-input" class="form-control" placeholder="Search file path...">
          <select id="files-project-filter" class="form-control">
            <option value="">All Projects</option>
          </select>
          <select id="files-ext-filter" class="form-control">
            <option value="">All Extensions</option>
            <option value=".php">.php</option>
            <option value=".ts">.ts</option>
            <option value=".tsx">.tsx</option>
            <option value=".js">.js</option>
            <option value=".jsx">.jsx</option>
            <option value=".sql">.sql</option>
            <option value=".md">.md</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table" id="files-table">
            <thead>
              <tr>
                <th>Relative Path</th>
                <th>Project</th>
                <th>Language</th>
                <th>Size</th>
                <th>Chunks</th>
                <th>Last Indexed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="7" class="text-center text-muted">Loading files...</td></tr>
            </tbody>
          </table>
          <div class="pagination-bar" id="files-pagination"></div>
        </div>
      </div>
    </section>
  `;
}
