const SAMPLE_LINES = [
  { id: 'AUTH-01 · GET /pricing', status: 'pass' },
  { id: 'RBAC-06 · POST /api/credentials/save', status: 'pass' },
  { id: 'DISP-04 · POST /api/checkout', status: 'fail' },
  { id: 'SEO-01 · GET /robots.txt', status: 'pass' },
  { id: 'CRED-05 · POST /api/verify', status: 'fail' },
  { id: 'RBAC-01 · POST /api/orders (no auth)', status: 'pass' },
  { id: 'PERF-08 · rate-limit probe', status: 'run' },
  { id: 'ADMIN-02 · GET /api/admin/users', status: 'pass' },
  { id: 'MAIL-02 · SMTP failure path', status: 'pass' },
  { id: 'CORR-03 · unauthenticated corroborate', status: 'pass' },
];

const ledger = document.getElementById('ledger');
let i = 0;

function addLine() {
  const item = SAMPLE_LINES[i % SAMPLE_LINES.length];
  i++;
  const row = document.createElement('div');
  row.className = 'ledger-line';
  const label = item.status === 'pass' ? 'PASS' : item.status === 'fail' ? 'FAIL' : 'RUNNING';
  row.innerHTML = `<span class="ledger-id">${item.id}</span><span class="ledger-status ${item.status}">${label}</span>`;
  ledger.appendChild(row);
  while (ledger.children.length > 12) ledger.removeChild(ledger.firstChild);
  ledger.scrollTop = ledger.scrollHeight;
}

if (ledger) {
  for (let n = 0; n < 7; n++) setTimeout(addLine, n * 220);
  setInterval(addLine, 1600);
}
