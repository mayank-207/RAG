/**
 * View 6: AST Symbols View Component
 */
export function renderSymbolsView() {
  return `
    <section id="view-symbols" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Code Symbols</h2>
          <p class="panel-sub">Classes, methods, functions, components, hooks, and routes extracted via AST</p>
        </div>
        <div class="filter-group">
          <input type="text" id="symbols-search-input" class="form-control" placeholder="Search symbol name or signature...">
          <select id="symbols-project-filter" class="form-control">
            <option value="">All Projects</option>
          </select>
          <select id="symbols-kind-filter" class="form-control">
            <option value="">All Kinds</option>
            <option value="class">Class</option>
            <option value="method">Method</option>
            <option value="function">Function</option>
            <option value="component">Component</option>
            <option value="hook">Hook</option>
            <option value="model">Model</option>
            <option value="controller">Controller</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-body p-0">
          <table class="table" id="symbols-table">
            <thead>
              <tr>
                <th>Symbol Name</th>
                <th>Kind</th>
                <th>Namespace / Parent</th>
                <th>File</th>
                <th>Lines</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" class="text-center text-muted">Loading symbols...</td></tr>
            </tbody>
          </table>
          <div class="pagination-bar" id="symbols-pagination"></div>
        </div>
      </div>
    </section>
  `;
}
