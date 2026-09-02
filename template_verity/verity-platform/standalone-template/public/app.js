const state = { tests: [], dataset: null, project: null };
const el = (id) => document.getElementById(id);

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

async function loadAll() {
  const [tests, dataset, project] = await Promise.all([api('/api/tests'), api('/api/dataset'), api('/api/project')]);
  state.tests = tests; state.dataset = dataset; state.project = project;
  el('projectName').textContent = project.name || 'Verity Test Runner';
  el('projectUrl').textContent = project.site_url || 'self-hosted';
  renderList(); renderScoreboard();
}

function statusDotClass(t) {
  if (!t.lastResult) return t.type === 'manual' ? 'manual-pending' : 'notrun';
  return t.lastResult.pass ? 'pass' : 'fail';
}

function renderList() {
  const list = el('testList');
  list.innerHTML = '';
  const cats = [...new Set(state.tests.map(t => t.category))];
  for (const cat of cats) {
    const h = document.createElement('div'); h.className = 'category-heading'; h.textContent = cat; list.appendChild(h);
    for (const t of state.tests.filter(x => x.category === cat)) {
      const card = document.createElement('div');
      card.className = 'test-card';
      const tags = [];
      if ((t.tags || []).includes('regression')) tags.push('<span class="tag regression">Regression</span>');
      if ((t.tags || []).includes('security')) tags.push('<span class="tag security">Security</span>');
      if (t.priority === 'High') tags.push('<span class="tag priority-high">High</span>');
      if (t.type === 'manual') tags.push('<span class="tag type-manual">Manual</span>');
      if (t.type === 'load') tags.push('<span class="tag type-manual">Load test</span>');
      card.innerHTML = `<div class="test-id">${t.id}</div>
        <div class="test-main"><div class="test-title">${t.title}</div><div class="test-tags">${tags.join('')}</div></div>
        <div class="test-actions"><span class="status-dot ${statusDotClass(t)}"></span></div>`;
      card.onclick = () => openDetail(t.id);
      list.appendChild(card);
    }
  }
}

function renderScoreboard() {
  const auto = state.tests.filter(t => t.type !== 'manual');
  const pass = state.tests.filter(t => t.lastResult && t.lastResult.pass).length;
  const fail = state.tests.filter(t => t.lastResult && !t.lastResult.pass).length;
  const notRun = auto.filter(t => !t.lastResult).length;
  el('scorePass').textContent = pass; el('scoreFail').textContent = fail; el('scoreNotRun').textContent = notRun;
  const total = state.tests.length || 1;
  el('scoreBarFill').innerHTML = `<div style="width:${(pass/total)*100}%;background:var(--green)"></div><div style="width:${(fail/total)*100}%;background:var(--red)"></div>`;
}

function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function verdictHtml(r) {
  if (!r) return `<div class="verdict-banner pending">Not run yet.</div>`;
  return `<div class="verdict-banner ${r.pass ? 'pass' : 'fail'}"><strong>${r.pass ? 'PASS' : 'FAIL'}</strong> — ${escapeHtml(r.message||'')}<div class="muted" style="margin-top:6px">${r.ranAt ? new Date(r.ranAt).toLocaleString() : ''}</div></div>`;
}

function reqHtml(r) {
  if (!r) return '';
  if (r.requests) return r.requests.map(x => {
    const cls = x.status == null ? 'serr' : (x.status < 300 ? 's2' : (x.status < 500 ? 's4' : 's5'));
    return `<div class="req-row"><span>${x.method} ${x.url}</span><span class="req-status ${cls}">${x.status ?? (x.error||'ERR')} · ${x.durationMs}ms</span></div>`;
  }).join('');
  if (r.stats) return `<div class="req-row">p50 ${r.stats.p50}ms · p95 ${r.stats.p95}ms · statuses ${escapeHtml(JSON.stringify(r.stats.statusCounts))}</div>`;
  return '';
}

async function openDetail(id) {
  const t = state.tests.find(x => x.id === id);
  el('detailTitle').textContent = `${t.id} — ${t.title}`;
  el('detailSub').textContent = `${t.category} · ${t.priority} · ${t.type}`;
  let body = '';
  if (t.dataFields && t.dataFields.length) body += `<div class="detail-section"><div class="detail-label">Dataset fields used</div>${t.dataFields.map(f=>`<span class="field-chip">${f}</span>`).join('')}</div>`;
  if (t.type === 'manual') {
    body += `<div class="instructions-box">${escapeHtml(t.spec ? t.spec.instructions : '')}</div>
      <div class="detail-run-row"><button class="btn small" id="mPass" style="border-color:var(--green);color:var(--green)">Mark PASS</button><button class="btn small" id="mFail" style="border-color:var(--red);color:var(--red)">Mark FAIL</button></div>
      <textarea class="notes-input" id="mNotes" placeholder="Notes..."></textarea>
      <div class="detail-section">${verdictHtml(t.lastResult)}</div>`;
  } else {
    body += `<div class="detail-run-row"><button class="btn primary small" id="runOne">▶ Run this test</button></div>
      <div id="verdictArea">${verdictHtml(t.lastResult)}</div>
      <div class="detail-section"><div class="detail-label">Requests</div><div id="reqArea">${reqHtml(t.lastResult)}</div></div>`;
  }
  el('detailBody').innerHTML = body;
  if (t.type === 'manual') {
    el('mPass').onclick = () => submitManual(id, true);
    el('mFail').onclick = () => submitManual(id, false);
  } else {
    el('runOne').onclick = () => runOne(id);
  }
  el('detailBackdrop').classList.add('open');
}

async function submitManual(id, pass) {
  const notes = el('mNotes').value;
  await api(`/api/tests/${id}/manual-result`, { method: 'POST', body: JSON.stringify({ pass, notes }) });
  await loadAll();
  openDetail(id);
}

async function runOne(id) {
  const btn = el('runOne'); btn.disabled = true; btn.textContent = 'Running…';
  try {
    const r = await api(`/api/tests/${id}/run`, { method: 'POST' });
    const t = state.tests.find(x => x.id === id); t.lastResult = r;
    el('verdictArea').innerHTML = verdictHtml(r);
    el('reqArea').innerHTML = reqHtml(r);
    renderList(); renderScoreboard();
  } catch (err) { el('verdictArea').innerHTML = `<div class="verdict-banner fail">${escapeHtml(err.message)}</div>`; }
  btn.disabled = false; btn.textContent = '▶ Run this test';
}

async function runAll() {
  const btn = el('btnRunAll'); btn.disabled = true; btn.textContent = 'Running…';
  try {
    const results = await api('/api/tests/run-all', { method: 'POST' });
    for (const r of results) { const t = state.tests.find(x => x.id === r.id); if (t) t.lastResult = r; }
    renderList(); renderScoreboard();
  } catch (err) { alert(err.message); }
  btn.disabled = false; btn.textContent = 'Run all automated';
}

el('btnDataset').onclick = () => { el('datasetEditor').value = JSON.stringify(state.dataset, null, 2); el('datasetBackdrop').classList.add('open'); };
el('btnCloseDataset').onclick = () => el('datasetBackdrop').classList.remove('open');
el('btnSaveDataset').onclick = async () => {
  try {
    const parsed = JSON.parse(el('datasetEditor').value);
    state.dataset = await api('/api/dataset', { method: 'PUT', body: JSON.stringify(parsed) });
    el('datasetStatus').textContent = 'Saved.'; el('datasetStatus').style.color = 'var(--green)';
  } catch (err) { el('datasetStatus').textContent = err.message; el('datasetStatus').style.color = 'var(--red)'; }
};
el('btnUpload').onclick = () => el('uploadBackdrop').classList.add('open');
el('btnCloseUpload').onclick = () => el('uploadBackdrop').classList.remove('open');
el('btnSubmitUpload').onclick = async () => {
  try {
    const r = await api('/api/tests/upload', { method: 'POST', body: JSON.stringify({ format: el('uploadFormat').value, content: el('uploadFormat').value === 'json' ? JSON.parse(el('uploadContent').value) : el('uploadContent').value }) });
    el('uploadStatus').textContent = `Added ${r.added} test(s).`; el('uploadStatus').style.color = 'var(--green)';
    await loadAll();
  } catch (err) { el('uploadStatus').textContent = err.message; el('uploadStatus').style.color = 'var(--red)'; }
};
el('btnCloseDetail').onclick = () => el('detailBackdrop').classList.remove('open');
el('btnRunAll').onclick = runAll;
el('btnExportJson').onclick = () => window.open('/api/export?format=json', '_blank');
el('btnExportCsv').onclick = () => window.open('/api/export?format=csv', '_blank');
for (const b of [el('datasetBackdrop'), el('uploadBackdrop'), el('detailBackdrop')]) b.addEventListener('click', e => { if (e.target === b) b.classList.remove('open'); });

loadAll().catch(err => { document.body.innerHTML = `<div style="padding:40px;color:#f2685f;font-family:monospace">Failed to load: ${err.message}</div>`; });
