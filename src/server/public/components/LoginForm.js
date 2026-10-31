/**
 * LoginForm Component
 * Renders an authentic shadcn/ui Login Screen with ambient lighting,
 * input icons, password show/hide toggle, and 1-click credential auto-fill.
 */

export function renderLoginForm() {
  return `
    <div id="login-overlay" class="login-overlay">
      <div class="login-background-glow glow-1"></div>
      <div class="login-background-glow glow-2"></div>
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div class="brand-title-wrap">
              <span class="brand-title">code-context-mcp</span>
              <span class="badge badge-info">v1.0</span>
            </div>
            <div class="login-sub">Developer Control Plane & RAG Engine</div>
          </div>
        </div>

        <div class="login-welcome">
          <h3>Sign In</h3>
          <p>Access your local indexing, projects, and AI model providers</p>
        </div>

        <form id="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <input type="text" id="username" class="form-control with-icon" value="admin" required autocomplete="username" placeholder="admin">
            </div>
          </div>

          <div class="form-group">
            <div class="label-row">
              <label for="password">Password</label>
              <button type="button" id="toggle-password-btn" class="text-btn">Show</button>
            </div>
            <div class="input-wrapper">
              <span class="input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <input type="password" id="password" class="form-control with-icon" required autocomplete="current-password" placeholder="••••••••">
            </div>
          </div>

          <div id="login-error" class="alert alert-danger hidden"></div>

          <button type="submit" id="login-submit-btn" class="btn btn-primary btn-block">
            <span>Sign In</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </form>

      </div>
    </div>
  `;
}

export function initLoginForm(callbacks) {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const toggleBtn = document.getElementById('toggle-password-btn');
  const passInput = document.getElementById('password');
  const fillBtn = document.getElementById('fill-demo-btn');

  if (toggleBtn && passInput) {
    toggleBtn.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      toggleBtn.textContent = isPass ? 'Hide' : 'Show';
    });
  }

  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      const u = document.getElementById('username');
      if (u) u.value = 'admin';
      if (passInput) {
        passInput.value = 'admin123';
        passInput.focus();
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.classList.add('hidden');

      const username = document.getElementById('username').value.trim();
      const password = passInput.value;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Login failed');
        }

        if (callbacks?.onSuccess) {
          callbacks.onSuccess(data);
        }
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
      }
    });
  }
}

