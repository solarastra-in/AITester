// ---------------------------------------------------------------------------
// Minimal hash-router SPA. No build step, no framework — kept deliberately
// simple so the whole console ships as two static files.
// ---------------------------------------------------------------------------
const APP = document.getElementById('app');
let TOKEN = localStorage.getItem('verity_token') || null;
let ME = null; // { user, org }

function setToken(t) { TOKEN = t; if (t) localStorage.setItem('verity_token', t); else localStorage.removeItem('verity_token'); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body;
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(s) { return s ? new Date(s).toLocaleString() : '—'; }

// ---------------------------------------------------------------------------
// Shell (topbar) — rendered around every authenticated view
// ---------------------------------------------------------------------------
function shell(contentHtml, activeTab) {
  const role = ME?.user?.role;
  const tabs = [];
  tabs.push({ id: 'projects', label: 'Projects', href: '#/projects' });
  if (role === 'org_admin') tabs.push({ id: 'org', label: 'Team', href: '#/org' });
  if (role === 'platform_admin') tabs.push({ id: 'admin', label: 'Admin', href: '#/admin' });
  tabs.push({ id: 'billing', label: 'Credits', href: '#/billing' });

  const creditsBal = role === 'org_admin' || role === 'member' ? (ME?.org?.credits_balance ?? '—') : (ME?.user?.credits_balance ?? '—');

  APP.innerHTML = `
    <div class="console">
      <header class="topbar">
        <div class="brand" onclick="location.hash='#/projects'">
          <span class="brand-mark">◈</span>
          <div><div class="brand-title">Verity</div><div class="brand-sub">${esc(ME?.org?.name || 'Automated test platform')}</div></div>
        </div>
        <div class="topbar-actions">
          <nav class="nav-tabs">
            ${tabs.map(t => `<a class="nav-tab ${activeTab === t.id ? 'active' : ''}" href="${t.href}">${t.label}</a>`).join('')}
          </nav>
          <span class="credits-pill">${creditsBal} credits</span>
          <span class="badge ${role}">${role?.replace('_', ' ')}</span>
          <button class="btn ghost small" id="btnLogout">Log out</button>
        </div>
      </header>
      <main class="body">${contentHtml}</main>
    </div>
  `;
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) logoutBtn.onclick = () => { setToken(null); ME = null; location.hash = '#/login'; };
}

// ---------------------------------------------------------------------------
// Auth views
// ---------------------------------------------------------------------------
function viewLogin() {
  APP.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-title">Log in to Verity</div>
        <div class="auth-sub">Automated functional testing for any site.</div>
        <form id="loginForm">
          <label>Email</label><input type="email" id="email" required />
          <label>Password</label><input type="password" id="password" required />
          <button class="btn primary" style="width:100%;margin-top:18px" type="submit">Log in</button>
        </form>
        <div id="err"></div>
        <div class="auth-switch">No account? <a href="#/signup">Start free as a standalone user</a></div>
        <div class="auth-switch" style="margin-top:6px"><a href="/">← Back to homepage</a></div>
      </div>
    </div>
  `;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
      setToken(r.token); await loadMe();
      location.hash = r.user.must_reset_password ? '#/reset-password' : '#/projects';
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="auth-error">${esc(err.message)}</div>`;
    }
  };
}

function viewSignup() {
  APP.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-title">Create your account</div>
        <div class="auth-sub">Standalone accounts get a free trial credit grant — no org required.</div>
        <form id="signupForm">
          <label>Name</label><input type="text" id="name" />
          <label>Email</label><input type="email" id="email" required />
          <label>Password (min 8 characters)</label><input type="password" id="password" required minlength="8" />
          <button class="btn primary" style="width:100%;margin-top:18px" type="submit">Create account</button>
        </form>
        <div id="err"></div>
        <div class="auth-switch">Already have an account? <a href="#/login">Log in</a></div>
      </div>
    </div>
  `;
  document.getElementById('signupForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name: name.value, email: email.value, password: password.value }) });
      setToken(r.token); await loadMe(); location.hash = '#/projects';
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="auth-error">${esc(err.message)}</div>`;
    }
  };
}

function viewResetPassword() {
  APP.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-title">Set a new password</div>
        <div class="auth-sub">Your account was created with a temporary password. Set your own before continuing.</div>
        <form id="rpForm">
          <label>New password (min 8 characters)</label><input type="password" id="newPassword" required minlength="8" />
          <button class="btn primary" style="width:100%;margin-top:18px" type="submit">Set password</button>
        </form>
        <div id="err"></div>
      </div>
    </div>
  `;
  document.getElementById('rpForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ newPassword: newPassword.value }) });
      await loadMe(); location.hash = '#/projects';
    } catch (err) {
      document.getElementById('err').innerHTML = `<div class="auth-error">${esc(err.message)}</div>`;
    }
  };
}

function viewInvite(token) {
  APP.innerHTML = `<div class="auth-shell"><div class="auth-card"><div class="auth-title">Loading invite…</div></div></div>`;
  api(`/auth/invite/${token}`).then(invite => {
    APP.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card">
          <div class="auth-title">Join ${esc(invite.org.name)}</div>
          <div class="auth-sub">You've been invited as ${esc(invite.role.replace('_',' '))} — ${esc(invite.email)}</div>
          <form id="acceptForm">
            <label>Name</label><input type="text" id="name" />
            <label>Set a password (min 8 characters)</label><input type="password" id="password" required minlength="8" />
            <button class="btn primary" style="width:100%;margin-top:18px" type="submit">Accept & join</button>
          </form>
          <div id="err"></div>
        </div>
      </div>
    `;
    document.getElementById('acceptForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api(`/auth/invite/${token}/accept`, { method: 'POST', body: JSON.stringify({ name: name.value, password: password.value }) });
        setToken(r.token); await loadMe(); location.hash = '#/projects';
      } catch (err) { document.getElementById('err').innerHTML = `<div class="auth-error">${esc(err.message)}</div>`; }
    };
  }).catch(err => {
    APP.innerHTML = `<div class="auth-shell"><div class="auth-card"><div class="auth-title">Invite not found</div><div class="auth-sub">${esc(err.message)}</div></div></div>`;
  });
}

// ---------------------------------------------------------------------------
// Projects list + create
// ---------------------------------------------------------------------------
async function viewProjects() {
  shell(`<div class="empty-state">Loading…</div>`, 'projects');
  const projects = await api('/projects');
  const content = `
    <div class="page-head">
      <div><div class="page-title">Projects</div><div class="page-sub">Each project targets one site. Upload or generate its test suite, build the dataset, then run.</div></div>
      <button class="btn primary" id="btnNewProject">+ New project</button>
    </div>
    <div class="grid cols-3" id="projGrid">
      ${projects.length ? projects.map(p => `
        <div class="card clickable" data-id="${p.id}">
          <div style="font-weight:600;font-size:14px">${esc(p.name)}</div>
          <div class="muted" style="margin-top:4px;word-break:break-all">${esc(p.site_url)}</div>
          <div class="muted" style="margin-top:10px">Created ${fmtDate(p.created_at)}</div>
        </div>
      `).join('') : `<div class="empty-state" style="grid-column:1/-1">No projects yet. Create one to get started.</div>`}
    </div>
    <div id="newProjectForm" style="display:none;margin-top:20px" class="card">
      <div style="font-weight:600;margin-bottom:6px">New project</div>
      <label>Project name</label><input type="text" id="pName" placeholder="Marketing site QA" />
      <label>Site URL (base URL your tests will run against)</label><input type="url" id="pUrl" placeholder="https://example.com" />
      <label>Description (optional)</label><input type="text" id="pDesc" placeholder="What this site does — helps AI test generation" />
      <div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="btnCreateProject">Create</button><button class="btn ghost" id="btnCancelProject">Cancel</button></div>
    </div>
  `;
  shell(content, 'projects');
  document.getElementById('btnNewProject').onclick = () => { document.getElementById('newProjectForm').style.display = 'block'; };
  document.getElementById('btnCancelProject').onclick = () => { document.getElementById('newProjectForm').style.display = 'none'; };
  document.getElementById('btnCreateProject').onclick = async () => {
    try {
      const p = await api('/projects', { method: 'POST', body: JSON.stringify({ name: pName.value, site_url: pUrl.value, description: pDesc.value }) });
      location.hash = `#/projects/${p.id}`;
    } catch (err) { toast(err.message, 'error'); }
  };
  document.querySelectorAll('#projGrid [data-id]').forEach(el => {
    el.onclick = () => location.hash = `#/projects/${el.dataset.id}`;
  });
}

// ---------------------------------------------------------------------------
// Project workspace
// ---------------------------------------------------------------------------
let WS = { project: null, cases: [], dataset: null, activeCategory: 'ALL' };

async function viewWorkspace(projectId) {
  shell(`<div class="empty-state">Loading…</div>`, 'projects');
  const [project, cases, dataset] = await Promise.all([
    api(`/projects/${projectId}`), api(`/projects/${projectId}/cases`), api(`/projects/${projectId}/dataset`),
  ]);
  WS = { project, cases, dataset, activeCategory: 'ALL' };
  renderWorkspace();
}

function renderWorkspace() {
  const { project, cases } = WS;
  const cats = [...new Set(cases.map(c => c.category))];
  const pass = cases.filter(c => c.lastResult && c.lastResult.pass).length;
  const fail = cases.filter(c => c.lastResult && !c.lastResult.pass).length;
  const notRun = cases.filter(c => !c.lastResult).length;

  const nav = `
    <div class="cat-item ${WS.activeCategory === 'ALL' ? 'active' : ''}" data-cat="ALL"><span>All tests</span><span class="cat-count">${cases.length}</span></div>
    ${cats.map(c => `<div class="cat-item ${WS.activeCategory === c ? 'active' : ''}" data-cat="${esc(c)}"><span>${esc(c)}</span><span class="cat-count">${cases.filter(x=>x.category===c).length}</span></div>`).join('')}
  `;
  const visibleCats = WS.activeCategory === 'ALL' ? cats : [WS.activeCategory];
  const list = visibleCats.map(cat => `
    <div class="category-heading">${esc(cat)}</div>
    ${cases.filter(c => c.category === cat).map(c => {
      const tags = [];
      if ((c.tags||[]).includes('regression')) tags.push('<span class="tag regression">Regression</span>');
      if ((c.tags||[]).includes('security')) tags.push('<span class="tag security">Security</span>');
      if (c.priority === 'High') tags.push('<span class="tag priority-high">High</span>');
      if (c.type === 'manual') tags.push('<span class="tag type-manual">Manual</span>');
      if (c.type === 'load') tags.push('<span class="tag type-manual">Load test</span>');
      const dot = !c.lastResult ? (c.type === 'manual' ? 'manual-pending' : 'notrun') : (c.lastResult.pass ? 'pass' : 'fail');
      return `<div class="test-card" data-case="${c.id}">
        <div class="test-id">${esc(c.ext_id)}</div>
        <div class="test-main"><div class="test-title">${esc(c.title)}</div><div class="test-tags">${tags.join('')}</div></div>
        <div class="test-actions"><span class="status-dot ${dot}"></span></div>
      </div>`;
    }).join('')}
  `).join('');

  const content = `
    <div class="page-head">
      <div>
        <div class="page-title">${esc(project.name)}</div>
        <div class="page-sub">${esc(project.site_url)}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost small" id="btnBack">← Projects</button>
        <button class="btn ghost small" id="btnDataset">Dataset</button>
        <button class="btn ghost small" id="btnUpload">Upload tests</button>
        <button class="btn ghost small" id="btnGenerate">Generate with AI</button>
        <button class="btn ghost small" id="btnExportJson">Export JSON</button>
        <button class="btn ghost small" id="btnExportCsv">Export CSV</button>
        <button class="btn ghost small" id="btnDownloadPkg">Download package ⤓</button>
        <button class="btn ghost small" id="btnRunAllPreview">Run all (free preview)</button>
        <button class="btn primary small" id="btnRunAllHosted">Run all (hosted, ${cases.filter(c=>c.type!=='manual').length} credits)</button>
      </div>
    </div>
    <div class="scoreboard" style="border:1px solid var(--line);border-radius:8px;margin-bottom:16px">
      <div class="score-cell"><div class="score-num" style="color:var(--green)">${pass}</div><div class="score-label">pass</div></div>
      <div class="score-cell"><div class="score-num" style="color:var(--red)">${fail}</div><div class="score-label">fail</div></div>
      <div class="score-cell"><div class="score-num" style="color:var(--text-faint)">${notRun}</div><div class="score-label">not run</div></div>
    </div>
    <div class="workspace-body" style="height:calc(100vh - 320px);border:1px solid var(--line);border-radius:8px;overflow:hidden">
      <nav class="category-nav" id="wsNav">${nav}</nav>
      <section class="workspace-list" id="wsList">${cases.length ? list : `<div class="empty-state">No test cases yet. Upload a plan or generate one with AI.</div>`}</section>
    </div>
    <div class="drawer-backdrop" id="datasetBackdrop"><div class="drawer">
      <div class="drawer-head"><div><div class="drawer-title">Dataset</div><div class="drawer-sub">Values available to every test via {{dotted.path}} templates — auth tokens, provider keys, sample records.</div></div><button class="btn ghost" id="btnCloseDataset">Close</button></div>
      <div class="drawer-body"><textarea id="datasetEditor" style="width:100%;height:100%;min-height:60vh" spellcheck="false"></textarea></div>
      <div class="drawer-foot"><span id="datasetStatus" class="muted"></span><button class="btn primary" id="btnSaveDataset">Save</button></div>
    </div></div>
    <div class="drawer-backdrop" id="uploadBackdrop"><div class="drawer">
      <div class="drawer-head"><div><div class="drawer-title">Upload test cases</div><div class="drawer-sub">Structured JSON, structured CSV, or a markdown test-plan table (best-effort parsed; anything ambiguous becomes a manual case).</div></div><button class="btn ghost" id="btnCloseUpload">Close</button></div>
      <div class="drawer-body">
        <label>Suite name</label><input type="text" id="uploadName" placeholder="Imported suite" />
        <label>Format</label>
        <select id="uploadFormat"><option value="json">Structured JSON</option><option value="csv">Structured CSV</option><option value="markdown">Markdown table</option></select>
        <label>Content</label><textarea id="uploadContent" style="height:40vh" placeholder="Paste content here..."></textarea>
      </div>
      <div class="drawer-foot"><span id="uploadStatus" class="muted"></span><button class="btn primary" id="btnSubmitUpload">Add tests</button></div>
    </div></div>
    <div class="drawer-backdrop" id="genBackdrop"><div class="drawer">
      <div class="drawer-head"><div><div class="drawer-title">Generate test cases with AI</div><div class="drawer-sub">Uses your own model API key — never sent anywhere but that provider.</div></div><button class="btn ghost" id="btnCloseGen">Close</button></div>
      <div class="drawer-body">
        <label>Suite name</label><input type="text" id="genName" placeholder="AI-generated suite" />
        <label>Provider</label>
        <select id="genProvider"><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option></select>
        <label>API key</label><input type="password" id="genKey" placeholder="sk-..." />
        <label>Model (optional — sensible default used if blank)</label><input type="text" id="genModel" placeholder="claude-sonnet-4-6" />
        <label>Site description (optional, improves generated cases)</label><textarea id="genDesc" style="height:80px" placeholder="What does this site/product do? Who are the user roles?"></textarea>
        <label>Paste an existing test plan to convert (optional)</label><textarea id="genPlan" style="height:120px" placeholder="Paste a messy test plan / notes here and the AI will structure it"></textarea>
      </div>
      <div class="drawer-foot"><span id="genStatus" class="muted"></span><button class="btn primary" id="btnSubmitGen">Generate</button></div>
    </div></div>
    <div class="drawer-backdrop" id="detailBackdrop"><div class="drawer">
      <div class="drawer-head"><div><div class="drawer-title" id="detailTitle">—</div><div class="drawer-sub" id="detailSub">—</div></div><button class="btn ghost" id="btnCloseDetail">Close</button></div>
      <div class="drawer-body" id="detailBody"></div>
    </div></div>
  `;
  shell(content, 'projects');
  wireWorkspace();
}

function wireWorkspace() {
  document.getElementById('btnBack').onclick = () => location.hash = '#/projects';
  document.querySelectorAll('#wsNav [data-cat]').forEach(el => { el.onclick = () => { WS.activeCategory = el.dataset.cat; renderWorkspace(); }; });
  document.querySelectorAll('#wsList [data-case]').forEach(el => { el.onclick = () => openCaseDetail(el.dataset.case); });

  document.getElementById('btnDataset').onclick = () => { document.getElementById('datasetEditor').value = JSON.stringify(WS.dataset, null, 2); document.getElementById('datasetBackdrop').classList.add('open'); };
  document.getElementById('btnCloseDataset').onclick = () => document.getElementById('datasetBackdrop').classList.remove('open');
  document.getElementById('btnSaveDataset').onclick = async () => {
    try {
      const parsed = JSON.parse(document.getElementById('datasetEditor').value);
      WS.dataset = await api(`/projects/${WS.project.id}/dataset`, { method: 'PUT', body: JSON.stringify(parsed) });
      document.getElementById('datasetStatus').textContent = 'Saved.'; document.getElementById('datasetStatus').style.color = 'var(--green)';
    } catch (err) { document.getElementById('datasetStatus').textContent = err.message; document.getElementById('datasetStatus').style.color = 'var(--red)'; }
  };

  document.getElementById('btnUpload').onclick = () => document.getElementById('uploadBackdrop').classList.add('open');
  document.getElementById('btnCloseUpload').onclick = () => document.getElementById('uploadBackdrop').classList.remove('open');
  document.getElementById('btnSubmitUpload').onclick = async () => {
    const format = document.getElementById('uploadFormat').value;
    const raw = document.getElementById('uploadContent').value;
    try {
      let content = raw;
      if (format === 'json') content = JSON.parse(raw);
      const r = await api(`/projects/${WS.project.id}/suites/upload`, { method: 'POST', body: JSON.stringify({ name: document.getElementById('uploadName').value, format, content }) });
      document.getElementById('uploadStatus').textContent = `Added ${r.caseCount} test(s), ${r.autoDetectedManual} flagged manual.`;
      document.getElementById('uploadStatus').style.color = 'var(--green)';
      await refreshCases();
    } catch (err) { document.getElementById('uploadStatus').textContent = err.message; document.getElementById('uploadStatus').style.color = 'var(--red)'; }
  };

  document.getElementById('btnGenerate').onclick = () => document.getElementById('genBackdrop').classList.add('open');
  document.getElementById('btnCloseGen').onclick = () => document.getElementById('genBackdrop').classList.remove('open');
  document.getElementById('btnSubmitGen').onclick = async () => {
    const btn = document.getElementById('btnSubmitGen'); btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const r = await api(`/projects/${WS.project.id}/suites/generate`, { method: 'POST', body: JSON.stringify({
        name: document.getElementById('genName').value, provider: document.getElementById('genProvider').value,
        apiKey: document.getElementById('genKey').value, model: document.getElementById('genModel').value,
        description: document.getElementById('genDesc').value, existingPlanText: document.getElementById('genPlan').value,
      }) });
      document.getElementById('genStatus').textContent = `Generated ${r.caseCount} test(s).`; document.getElementById('genStatus').style.color = 'var(--green)';
      await refreshCases();
    } catch (err) { document.getElementById('genStatus').textContent = err.message; document.getElementById('genStatus').style.color = 'var(--red)'; }
    btn.disabled = false; btn.textContent = 'Generate';
  };

  document.getElementById('btnExportJson').onclick = () => window.open(`/api/projects/${WS.project.id}/export?format=json`, '_blank');
  document.getElementById('btnExportCsv').onclick = () => window.open(`/api/projects/${WS.project.id}/export?format=csv`, '_blank');
  document.getElementById('btnDownloadPkg').onclick = async () => {
    const resp = await fetch(`/api/package/${WS.project.id}/download`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!resp.ok) { toast('Download failed', 'error'); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${WS.project.name.replace(/\W+/g,'_')}-test-runner.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById('btnRunAllPreview').onclick = () => runAll('preview');
  document.getElementById('btnRunAllHosted').onclick = () => runAll('hosted');
  document.getElementById('btnCloseDetail').onclick = () => document.getElementById('detailBackdrop').classList.remove('open');
}

async function refreshCases() {
  WS.cases = await api(`/projects/${WS.project.id}/cases`);
  document.querySelectorAll('.drawer-backdrop.open').forEach(d => d.classList.remove('open'));
  renderWorkspace();
}

async function runAll(mode) {
  const btnId = mode === 'preview' ? 'btnRunAllPreview' : 'btnRunAllHosted';
  const btn = document.getElementById(btnId); const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Running…';
  try {
    const results = await api(`/projects/${WS.project.id}/run-all`, { method: 'POST', body: JSON.stringify({ mode }) });
    const byId = Object.fromEntries(results.map(r => [r.id, r]));
    WS.cases = WS.cases.map(c => byId[c.id] ? { ...c, lastResult: byId[c.id] } : c);
    if (mode === 'hosted') await loadMe();
    toast(`Run complete: ${results.filter(r=>r.pass).length}/${results.length} passed.`);
    renderWorkspace();
  } catch (err) { toast(err.message, 'error'); }
  if (document.getElementById(btnId)) { document.getElementById(btnId).disabled = false; document.getElementById(btnId).textContent = orig; }
}

function verdictHtml(r) {
  if (!r) return `<div class="verdict-banner pending">Not run yet.</div>`;
  return `<div class="verdict-banner ${r.pass ? 'pass' : 'fail'}"><strong>${r.pass ? 'PASS' : 'FAIL'}</strong> — ${esc(r.message||'')}<div class="muted" style="margin-top:6px">${fmtDate(r.ranAt)} ${r.executedBy ? `· ${r.executedBy}` : ''}</div></div>`;
}
function reqHtml(r) {
  if (!r || !r.requests) return '';
  return r.requests.map(x => {
    const cls = x.status == null ? 'serr' : (x.status < 300 ? 's2' : (x.status < 500 ? 's4' : 's5'));
    return `<div class="req-row"><span>${esc(x.method)} ${esc(x.url)}</span><span class="req-status ${cls}">${x.status ?? (x.error||'ERR')} · ${x.durationMs}ms</span></div>`;
  }).join('');
}

function openCaseDetail(caseId) {
  const c = WS.cases.find(x => x.id === caseId);
  document.getElementById('detailTitle').textContent = `${c.ext_id} — ${c.title}`;
  document.getElementById('detailSub').textContent = `${c.category} · ${c.priority} · ${c.type}`;
  let body = '';
  if (c.dataFields && c.dataFields.length) body += `<div class="detail-section"><div class="detail-label">Dataset fields used</div>${c.dataFields.map(f=>`<span class="field-chip">${esc(f)}</span>`).join('')}</div>`;
  if (c.type === 'manual') {
    body += `<div class="instructions-box">${esc(c.spec.instructions || '')}</div>
      <div class="detail-run-row"><button class="btn small" id="mPass" style="border-color:var(--green);color:var(--green)">Mark PASS</button><button class="btn small" id="mFail" style="border-color:var(--red);color:var(--red)">Mark FAIL</button></div>
      <textarea class="notes-input" id="mNotes" placeholder="Notes / evidence..."></textarea>
      <div class="detail-section">${verdictHtml(c.lastResult)}</div>`;
  } else {
    body += `<div class="detail-run-row">
        <button class="btn primary small" id="runPreview">▶ Run (free preview)</button>
        <button class="btn small" id="runHosted" style="border-color:var(--amber);color:var(--amber)">▶ Run hosted (1 credit)</button>
      </div>
      <div id="verdictArea">${verdictHtml(c.lastResult)}</div>
      <div class="detail-section"><div class="detail-label">Requests</div><div id="reqArea">${reqHtml(c.lastResult)}</div></div>`;
  }
  document.getElementById('detailBody').innerHTML = body;
  if (c.type === 'manual') {
    document.getElementById('mPass').onclick = () => submitManual(c.id, true);
    document.getElementById('mFail').onclick = () => submitManual(c.id, false);
  } else {
    document.getElementById('runPreview').onclick = () => runOne(c.id, 'preview');
    document.getElementById('runHosted').onclick = () => runOne(c.id, 'hosted');
  }
  document.getElementById('detailBackdrop').classList.add('open');
}

async function submitManual(id, pass) {
  const notes = document.getElementById('mNotes').value;
  await api(`/projects/${WS.project.id}/cases/${id}/manual-result`, { method: 'POST', body: JSON.stringify({ pass, notes }) });
  await refreshCases(); openCaseDetail(id);
}

async function runOne(id, mode) {
  const btnId = mode === 'preview' ? 'runPreview' : 'runHosted';
  const btn = document.getElementById(btnId); btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Running…';
  try {
    const r = await api(`/projects/${WS.project.id}/cases/${id}/${mode === 'preview' ? 'run' : 'run-hosted'}`, { method: 'POST' });
    const c = WS.cases.find(x => x.id === id); c.lastResult = r;
    document.getElementById('verdictArea').innerHTML = verdictHtml(r);
    document.getElementById('reqArea').innerHTML = reqHtml(r);
    if (mode === 'hosted') await loadMe();
  } catch (err) {
    document.getElementById('verdictArea').innerHTML = `<div class="verdict-banner fail">${esc(err.message)}</div>`;
  }
  btn.disabled = false; btn.textContent = orig;
}

// ---------------------------------------------------------------------------
// Org admin views
// ---------------------------------------------------------------------------
async function viewOrg() {
  shell(`<div class="empty-state">Loading…</div>`, 'org');
  const [org, team, projects, billing] = await Promise.all([
    api('/org'), api('/org/team'), api('/org/projects'), api('/org/billing'),
  ]);
  const content = `
    <div class="page-head"><div><div class="page-title">${esc(org.name)}</div><div class="page-sub">Plan: ${esc(org.plan)} · ${billing.credits_balance} credits available</div></div></div>
    <div class="grid cols-2" style="align-items:start">
      <div class="card">
        <div style="font-weight:600;margin-bottom:10px">Team</div>
        <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead><tbody>
          ${team.members.map(m => `<tr><td>${esc(m.name||'—')}</td><td>${esc(m.email)}</td><td><span class="badge ${m.role}">${m.role.replace('_',' ')}</span></td><td>${fmtDate(m.created_at)}</td></tr>`).join('')}
        </tbody></table>
        ${team.invites.filter(i=>i.status==='pending').length ? `<div style="margin-top:14px" class="muted">Pending invites: ${team.invites.filter(i=>i.status==='pending').map(i=>esc(i.email)).join(', ')}</div>` : ''}
        <div style="margin-top:16px;display:flex;gap:8px">
          <button class="btn primary small" id="btnSeedMember">Seed team member</button>
          <button class="btn ghost small" id="btnInviteMember">Send invite link</button>
        </div>
        <div id="seedResult"></div>
      </div>
      <div class="card">
        <div style="font-weight:600;margin-bottom:10px">Projects (${projects.length})</div>
        ${projects.length ? projects.map(p => `<div style="padding:8px 0;border-bottom:1px solid var(--line-soft)"><a href="#/projects/${p.id}">${esc(p.name)}</a><div class="muted">${esc(p.site_url)}</div></div>`).join('') : '<div class="muted">No projects yet.</div>'}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div style="font-weight:600;margin-bottom:10px">Credit ledger</div>
      <table><thead><tr><th>Date</th><th>Delta</th><th>Reason</th></tr></thead><tbody>
        ${billing.ledger.slice(0,20).map(l => `<tr><td>${fmtDate(l.created_at)}</td><td style="color:${l.delta>0?'var(--green)':'var(--red)'}">${l.delta>0?'+':''}${l.delta}</td><td>${esc(l.reason)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No activity yet.</td></tr>'}
      </tbody></table>
    </div>
  `;
  shell(content, 'org');
  document.getElementById('btnSeedMember').onclick = async () => {
    const email = prompt('Team member email:'); if (!email) return;
    const name = prompt('Name (optional):') || '';
    try {
      const r = await api('/org/team/seed', { method: 'POST', body: JSON.stringify({ email, name }) });
      document.getElementById('seedResult').innerHTML = `<div class="temp-pw-box">Account created for ${esc(r.user.email)}<br>Temporary password: <strong>${esc(r.tempPassword)}</strong><br>They'll be asked to set their own password on first login.</div>`;
      toast('Team member seeded');
    } catch (err) { toast(err.message, 'error'); }
  };
  document.getElementById('btnInviteMember').onclick = async () => {
    const email = prompt('Email to invite:'); if (!email) return;
    try {
      const r = await api('/org/team/invite', { method: 'POST', body: JSON.stringify({ email, role: 'member' }) });
      document.getElementById('seedResult').innerHTML = `<div class="temp-pw-box">Invite link (share with ${esc(email)}):<br>${location.origin}/console${r.acceptUrl}</div>`;
      toast('Invite created');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------------------
// Platform admin views
// ---------------------------------------------------------------------------
async function viewAdmin() {
  shell(`<div class="empty-state">Loading…</div>`, 'admin');
  const [stats, orgs] = await Promise.all([api('/admin/stats'), api('/admin/organizations')]);
  const content = `
    <div class="page-head"><div><div class="page-title">Platform Admin</div><div class="page-sub">Onboard customers, allocate credits, monitor usage.</div></div></div>
    <div class="grid cols-4">
      <div class="card"><div class="stat-num">${stats.orgs}</div><div class="stat-label">Organizations</div></div>
      <div class="card"><div class="stat-num">${stats.users}</div><div class="stat-label">Users</div></div>
      <div class="card"><div class="stat-num">${stats.projects}</div><div class="stat-label">Projects</div></div>
      <div class="card"><div class="stat-num">${stats.hostedRuns}</div><div class="stat-label">Hosted runs</div></div>
    </div>
    <div class="page-head" style="margin-top:24px"><div class="page-title" style="font-size:15px">Organizations</div><button class="btn primary small" id="btnNewOrg">+ Onboard customer</button></div>
    <div class="card">
      <table><thead><tr><th>Name</th><th>Plan</th><th>Credits</th><th>Members</th><th>Projects</th><th>Created</th></tr></thead><tbody>
        ${orgs.map(o => `<tr class="clickable" data-org="${o.id}" style="cursor:pointer"><td>${esc(o.name)}</td><td>${esc(o.plan)}</td><td>${o.credits_balance}</td><td>${o.memberCount}</td><td>${o.projectCount}</td><td>${fmtDate(o.created_at)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No organizations yet.</td></tr>'}
      </tbody></table>
    </div>
    <div id="newOrgForm" style="display:none;margin-top:16px" class="card">
      <div style="font-weight:600;margin-bottom:6px">Onboard a new customer organization</div>
      <label>Organization name</label><input type="text" id="oName" placeholder="Acme Inc." />
      <label>Org admin email</label><input type="email" id="oAdminEmail" placeholder="admin@acme.com" />
      <label>Org admin name (optional)</label><input type="text" id="oAdminName" />
      <label>Initial credit allocation</label><input type="number" id="oCredits" value="100" />
      <div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="btnCreateOrg">Create & seed admin</button><button class="btn ghost" id="btnCancelOrg">Cancel</button></div>
      <div id="orgResult"></div>
    </div>
  `;
  shell(content, 'admin');
  document.getElementById('btnNewOrg').onclick = () => { document.getElementById('newOrgForm').style.display = 'block'; };
  document.getElementById('btnCancelOrg').onclick = () => { document.getElementById('newOrgForm').style.display = 'none'; };
  document.getElementById('btnCreateOrg').onclick = async () => {
    try {
      const r = await api('/admin/organizations', { method: 'POST', body: JSON.stringify({
        orgName: oName.value, adminEmail: oAdminEmail.value, adminName: oAdminName.value, initialCredits: Number(oCredits.value || 0),
      }) });
      document.getElementById('orgResult').innerHTML = `<div class="temp-pw-box">Organization "${esc(r.organization.name)}" created.<br>Org admin: ${esc(r.orgAdmin.email)}<br>Temporary password: <strong>${esc(r.tempPassword)}</strong></div>`;
      toast('Organization onboarded');
    } catch (err) { toast(err.message, 'error'); }
  };
  document.querySelectorAll('[data-org]').forEach(el => { el.onclick = () => location.hash = `#/admin/org/${el.dataset.org}`; });
}

async function viewAdminOrgDetail(orgId) {
  shell(`<div class="empty-state">Loading…</div>`, 'admin');
  const detail = await api(`/admin/organizations/${orgId}`);
  const content = `
    <div class="page-head"><div><div class="page-title">${esc(detail.org.name)}</div><div class="page-sub">${detail.org.credits_balance} credits · ${detail.members.length} members · ${detail.projects.length} projects</div></div><button class="btn ghost small" id="btnBackAdmin">← Admin</button></div>
    <div class="card">
      <div style="font-weight:600;margin-bottom:8px">Grant / adjust credits</div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <div style="flex:1"><label>Amount (negative to deduct)</label><input type="number" id="grantAmount" value="100" /></div>
        <div style="flex:2"><label>Reason</label><input type="text" id="grantReason" placeholder="Quarterly top-up" /></div>
        <button class="btn primary" id="btnGrant">Apply</button>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:14px;align-items:start">
      <div class="card">
        <div style="font-weight:600;margin-bottom:8px">Members</div>
        <table><thead><tr><th>Email</th><th>Role</th></tr></thead><tbody>${detail.members.map(m=>`<tr><td>${esc(m.email)}</td><td><span class="badge ${m.role}">${m.role.replace('_',' ')}</span></td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card">
        <div style="font-weight:600;margin-bottom:8px">Projects</div>
        ${detail.projects.map(p=>`<div style="padding:6px 0">${esc(p.name)} — <span class="muted">${esc(p.site_url)}</span></div>`).join('') || '<div class="muted">None yet.</div>'}
      </div>
    </div>
    <div class="card" style="margin-top:14px">
      <div style="font-weight:600;margin-bottom:8px">Ledger</div>
      <table><thead><tr><th>Date</th><th>Delta</th><th>Reason</th></tr></thead><tbody>
        ${detail.ledger.map(l=>`<tr><td>${fmtDate(l.created_at)}</td><td style="color:${l.delta>0?'var(--green)':'var(--red)'}">${l.delta>0?'+':''}${l.delta}</td><td>${esc(l.reason)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No activity yet.</td></tr>'}
      </tbody></table>
    </div>
  `;
  shell(content, 'admin');
  document.getElementById('btnBackAdmin').onclick = () => location.hash = '#/admin';
  document.getElementById('btnGrant').onclick = async () => {
    try {
      await api(`/admin/organizations/${orgId}/credits`, { method: 'POST', body: JSON.stringify({ amount: Number(grantAmount.value), reason: grantReason.value || 'Manual admin adjustment' }) });
      toast('Credits updated'); viewAdminOrgDetail(orgId);
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------------------
// Billing (personal or org, depending on role)
// ---------------------------------------------------------------------------
async function viewBilling() {
  shell(`<div class="empty-state">Loading…</div>`, 'billing');
  const b = await api('/billing');
  const content = `
    <div class="page-head"><div><div class="page-title">Credits</div><div class="page-sub">${b.scope === 'organization' ? 'Shared organization balance' : 'Personal balance'} — ${b.credits_balance} credits available. 1 credit = 1 hosted automated test run. Self-hosting via the downloadable Docker package is always free.</div></div></div>
    <div class="grid cols-3">
      ${b.priceTable.map(p => `<div class="card"><div style="font-weight:600">${esc(p.label)}</div><div class="stat-num" style="margin-top:8px">$${p.priceUsd}</div><button class="btn ghost small" style="margin-top:12px" data-pkg="${p.id}">Buy</button></div>`).join('')}
    </div>
    <div class="card" style="margin-top:16px">
      <div style="font-weight:600;margin-bottom:8px">Recent activity</div>
      <table><thead><tr><th>Date</th><th>Delta</th><th>Reason</th></tr></thead><tbody>
        ${b.ledger.slice(0,30).map(l=>`<tr><td>${fmtDate(l.created_at)}</td><td style="color:${l.delta>0?'var(--green)':'var(--red)'}">${l.delta>0?'+':''}${l.delta}</td><td>${esc(l.reason)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No activity yet.</td></tr>'}
      </tbody></table>
    </div>
  `;
  shell(content, 'billing');
  document.querySelectorAll('[data-pkg]').forEach(btn => {
    btn.onclick = async () => {
      const r = await api('/billing/topup-intent', { method: 'POST', body: JSON.stringify({ packageId: btn.dataset.pkg }) });
      toast(r.message, 'error');
    };
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
async function loadMe() {
  if (!TOKEN) { ME = null; return; }
  try { ME = await api('/auth/me'); } catch { setToken(null); ME = null; }
}

async function route() {
  const hash = location.hash || '#/login';
  const [, path, param] = hash.match(/^#\/([^/]*)(?:\/(.*))?$/) || [];

  if (['login', 'signup'].includes(path)) {
    if (path === 'login') return viewLogin();
    return viewSignup();
  }
  if (path === 'invite') return viewInvite(param);

  if (!ME) await loadMe();
  if (!ME) { location.hash = '#/login'; return; }
  if (ME.user.must_reset_password && path !== 'reset-password') { location.hash = '#/reset-password'; return; }

  if (path === 'reset-password') return viewResetPassword();
  if (path === 'projects' && param) return viewWorkspace(param);
  if (path === 'projects' || !path) return viewProjects();
  if (path === 'org') return viewOrg();
  if (path === 'admin' && param && param.startsWith('org/')) return viewAdminOrgDetail(param.slice(4));
  if (path === 'admin') return viewAdmin();
  if (path === 'billing') return viewBilling();
  return viewProjects();
}

window.addEventListener('hashchange', route);
route();
