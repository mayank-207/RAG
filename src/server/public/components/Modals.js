/**
 * Modals Component
 * Renders reusable dialogs for AI Providers, Code Chunks, and Project Registration.
 */

export function renderModals() {
  return `
    <!-- AI Provider Modal -->
    <div id="provider-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <div class="modal-header">
          <h3 id="provider-modal-title">Configure AI Provider</h3>
          <button class="modal-close-btn" id="close-provider-modal">&times;</button>
        </div>
        <form id="provider-form">
          <div class="modal-body">
            <input type="hidden" id="prov-id">
            <div class="form-group">
              <label for="prov-name">Provider Name</label>
              <input type="text" id="prov-name" class="form-control" required placeholder="Google Gemini">
            </div>
            <div class="form-group">
              <label for="prov-type">Provider Type</label>
              <select id="prov-type" class="form-control" required>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="ollama">Local Ollama</option>
                <option value="openai_compatible">OpenAI Compatible (Custom URL)</option>
              </select>
            </div>
            <div class="form-group" id="prov-key-group">
              <label for="prov-key">API Key</label>
              <input type="password" id="prov-key" class="form-control" placeholder="Enter API Key (Encrypted with AES-256)">
              <small class="text-muted" id="prov-key-hint">Leave blank to keep existing encrypted key.</small>
            </div>
            <div class="form-group" id="prov-url-group">
              <label for="prov-url">Base URL</label>
              <input type="text" id="prov-url" class="form-control" placeholder="Leave blank for official API endpoint">
              <small class="text-muted" id="prov-url-hint">Leave blank for official Google Gemini / OpenAI / Claude API endpoints.</small>
            </div>
            <div class="form-group">
              <label for="prov-model">Default Model Name</label>
              <input type="text" id="prov-model" class="form-control" placeholder="gemini-2.0-flash">
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="prov-enabled" checked>
                <span>Enable this provider</span>
              </label>
            </div>
            <div id="prov-test-feedback" class="alert hidden"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="test-prov-btn">Test Connection</button>
            <button type="submit" class="btn btn-primary">Save Provider</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Chunk Viewer Modal -->
    <div id="chunk-modal" class="modal-overlay hidden">
      <div class="modal-card modal-lg">
        <div class="modal-header">
          <h3 id="chunk-modal-title">Chunk Inspector</h3>
          <button class="modal-close-btn" id="close-chunk-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="chunk-meta mb-3" id="chunk-meta-info"></div>
          <pre class="code-viewer" id="chunk-code-body"></pre>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="close-chunk-btn">Close</button>
        </div>
      </div>
    </div>

    <!-- Register Project Modal -->
    <div id="register-project-modal" class="modal-overlay hidden">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Register New Project</h3>
          <button class="modal-close-btn" id="close-reg-project-modal">&times;</button>
        </div>
        <form id="register-project-form">
          <div class="modal-body">
            <div class="form-group">
              <label for="reg-project-id">Project Identifier (Slug)</label>
              <input type="text" id="reg-project-id" class="form-control" required placeholder="crm">
              <small class="text-muted">Unique key used in MCP queries (lowercase, hyphens/underscores).</small>
            </div>
            <div class="form-group">
              <label for="reg-project-name">Project Display Name</label>
              <input type="text" id="reg-project-name" class="form-control" required placeholder="CRM Application">
            </div>
            <div class="form-group">
              <label for="reg-project-path">Absolute Root Path</label>
              <input type="text" id="reg-project-path" class="form-control" required placeholder="C:\\laragon\\www\\crm">
              <small class="text-muted">The directory containing the project source code.</small>
            </div>
            <div id="reg-project-error" class="alert alert-danger hidden"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancel-reg-project-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Register & Discover</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

