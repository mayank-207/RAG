/**
 * View 5: Code Chunks View Component
 */
export function renderChunksView() {
  return `
    <section id="view-chunks" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Code Chunks & Snippets</h2>
          <p class="panel-sub">Inspect segmented code blocks and embedding synchronization status</p>
        </div>
        <div class="filter-group">
          <input type="text" id="chunks-search-input" class="form-control" placeholder="Search chunk content or symbol...">
          <select id="chunks-project-filter" class="form-control">
            <option value="">All Projects</option>
          </select>
          <select id="chunks-type-filter" class="form-control">
            <option value="">All Types</option>
            <option value="method">Method</option>
            <option value="function">Function</option>
            <option value="class">Class</option>
            <option value="component">Component</option>
            <option value="hook">Hook</option>
            <option value="doc_section">Documentation</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table" id="chunks-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>File & Lines</th>
                <th>Language</th>
                <th>Preview</th>
                <th>Vectors</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="7" class="text-center text-muted">Loading chunks...</td></tr>
            </tbody>
          </table>
          <div class="pagination-bar" id="chunks-pagination"></div>
        </div>
      </div>
    </section>
  `;
}
