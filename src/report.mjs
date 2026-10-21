import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const messages = {
  'forbidden-marker': f => `Synthetic ${f.marker} data reached ${f.service} (request ${f.request}).`,
  'call-budget': f => `${f.service} received ${f.calls} calls; limit ${f.maximum}.`,
  'positive-control-missing': f => `No ${f.marker} marker observed at required destination ${f.service}.`,
  'fault-not-exercised': f => `The fault at ${f.service} was never injected.`,
  'service-not-exercised': f => `Required destination ${f.service} was never called.`,
  'command-failed': f => `Test command failed (exit ${f.exitCode ?? f.signal ?? 'unknown'}).`,
  'command-timeout': () => 'Test command exceeded its deadline and was terminated.',
  'command-start-failed': () => 'Test command could not start or be controlled.',
  'interrupted': () => 'The run was interrupted.',
  'body-limit': () => 'A request body exceeded the capture limit.',
  'request-limit': () => 'The request count exceeded the capture limit.',
  'incomplete-request': () => 'A request ended before its body was fully captured.',
  'capture-incomplete': () => 'At least one request was not fully captured.',
  'http-parser-error': () => 'A request could not be parsed as HTTP.',
  'unsupported-content-encoding': () => 'An encoded request body was not decoded; marker inspection is incomplete.',
  'unsupported-protocol': () => 'An HTTP upgrade or CONNECT attempt used an unsupported protocol.',
  'declared-inputs-changed': () => 'A declared source input changed while the matrix was running.'
};
export const describeFinding = f => messages[f.code]?.(f) ?? f.code;

export function renderMarkdown(report) {
  const lines = [`# OutageFence by Slanta Cause: ${report.name}`, '', `**${report.summary.status}** · ${report.summary.total}/${report.expectedScenarios} scenarios · ${report.observedAt}`, '',
    'Evidence: local synthetic HTTP. Only declared endpoints and marker representations are observed.', '',
    '| Scenario | Result | Requests | Findings |', '|---|---|---:|---:|'];
  for (const s of report.scenarios) lines.push(`| ${s.id} | ${s.status} | ${s.requests.length} | ${s.findings.length} |`);
  for (const s of report.scenarios) {
    lines.push('', `## ${s.id}: ${s.status}`, '');
    if (!s.findings.length) lines.push('Declared local contract satisfied.');
    for (const f of s.findings) lines.push(`- ${f.kind}: ${describeFinding(f)}`);
  }
  lines.push('', '## Evidence limits', '', ...report.boundaries.map(x => `- ${x}`), '',
    `Config SHA-256: ${report.provenance.configSha256}`, '',
    `Node ${report.provenance.nodeVersion} on ${report.provenance.platform}. Raw request values and command output are not retained.`, '');
  return lines.join('\n');
}

export function renderJUnit(report) {
  const counts = report.summary.counts;
  const interrupted = report.interrupted ? 1 : 0;
  const cases = report.scenarios.map(s => {
    const text = s.findings.map(describeFinding).join('\n');
    const detail = s.status === 'PASS' ? '' : s.status === 'ERROR'
      ? `<error type="execution" message="${esc(s.status)}">${esc(text)}</error>`
      : `<failure type="${s.status === 'FAIL' ? 'contract' : 'coverage'}" message="${esc(s.status)}">${esc(text)}</failure>`;
    return `<testcase classname="OutageFence" name="${esc(s.id)}" time="${(s.command.durationMs / 1000).toFixed(3)}">${detail}</testcase>`;
  });
  if (interrupted) cases.push('<testcase classname="OutageFence" name="matrix-completion"><error message="Interrupted matrix"/></testcase>');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${esc(report.name)}" tests="${report.scenarios.length + interrupted}" failures="${counts.FAIL + counts.INCONCLUSIVE}" errors="${counts.ERROR + interrupted}" skipped="0">\n${cases.join('\n')}\n</testsuite>\n`;
}

const style = `
:root{color-scheme:light;--ink:#142c32;--muted:#52686b;--line:#d9e1df;--paper:#f5f4ee;--green:#126b53;--red:#ab2f3a;--amber:#925800}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,sans-serif}a{color:inherit;text-underline-offset:4px}button{font:inherit;cursor:pointer}header{background:#12343b;color:#fff;padding:28px max(24px,calc((100vw - 1120px)/2))}header .top{display:flex;justify-content:space-between;gap:24px;align-items:center}.brand{font-size:20px;font-weight:750;letter-spacing:-.7px}.badge{display:inline-block;border:1px solid currentColor;border-radius:5px;padding:3px 9px;font-size:12px;font-weight:750;letter-spacing:.05em}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:700;color:#9ccbc1;margin-top:48px}h1{font-size:clamp(30px,5vw,52px);letter-spacing:-1.6px;line-height:1.12;margin:13px 0 18px;max-width:800px}header p{max-width:760px;color:#cae0dc;margin-bottom:32px}main{max-width:1168px;margin:auto;padding:30px 24px 64px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:-8px}.stat{border:1px solid var(--line);background:white;border-radius:9px;padding:17px 22px}.stat strong{font-size:32px;display:block;letter-spacing:-1px}.stat span{font-size:13px;color:var(--muted)}.pass{color:var(--green)}.fail,.error{color:var(--red)}.inconclusive{color:var(--amber)}h2{font-size:23px;letter-spacing:-.6px;margin:36px 0 12px}h3{font-size:17px;margin:0}.lead{color:var(--muted);max-width:800px}.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:white}table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:#edf1ec}td,th{padding:13px 17px;border-bottom:1px solid var(--line)}tr:last-child td{border-bottom:0}.filters{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0 16px}.filters button{border:1px solid #9daea8;background:transparent;color:var(--ink);padding:7px 14px;border-radius:25px;font-size:13px}.filters button[aria-pressed=true]{background:var(--ink);color:white}.scenario{background:white;border:1px solid var(--line);border-radius:9px;margin:12px 0;padding:20px}.scenario[hidden]{display:none}.scenario summary{display:flex;gap:16px;align-items:center;justify-content:space-between;cursor:pointer}.scenario summary h3{display:inline}.scenario ul{padding-left:22px;font-size:14px}.scenario .meta{color:var(--muted);font-size:12px;margin:14px 0}code{font:12px/1.6 ui-monospace,SFMono-Regular,monospace;word-break:break-all}.limits{background:#e8eee7;padding:22px;border-radius:9px;margin:32px 0}.limits h2{margin:0 0 10px}.limits p,.limits li{font-size:13px;color:#365450}.provenance{border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.empty{font-size:14px;color:var(--muted)}footer{font-size:12px;color:var(--muted);padding-top:20px}button:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #c07811;outline-offset:4px}@media(max-width:650px){.stats{grid-template-columns:repeat(2,1fr)}header{padding:24px}.eyebrow{margin-top:32px}.scenario{padding:16px}td,th{padding:10px}header .top{align-items:start}.badge{font-size:10px}}@media print{header{background:white;color:var(--ink);padding:0}header p,.eyebrow{color:var(--muted)}main{padding:20px 0}.filters{display:none}.scenario{break-inside:avoid}body{background:white}}
`;

export function renderHtml(report) {
  const { counts, status } = report.summary;
  const services = [...new Set(report.scenarios.flatMap(s => Object.keys(s.coverage)))];
  const rows = report.scenarios.map(s => `<tr><td><a href="#${esc(s.id)}">${esc(s.id)}</a>${s.baseline ? ' · baseline' : ''}</td><td><span class="badge ${s.status.toLowerCase()}">${s.status}</span></td>${services.map(n => `<td>${s.coverage[n]?.calls ?? 0}${s.coverage[n]?.faultsInjected ? ' / ⚡' + s.coverage[n].faultsInjected : ''}</td>`).join('')}<td>${s.command.durationMs} ms</td></tr>`).join('');
  const cards = report.scenarios.map(s => `<details class="scenario" id="${esc(s.id)}" data-status="${s.status}" ${s.status !== 'PASS' ? 'open' : ''}><summary><h3>${esc(s.id)}</h3><span class="badge ${s.status.toLowerCase()}">${s.status}</span></summary><p class="meta">${s.requests.length} captured requests · command exit ${esc(s.command.exitCode ?? s.command.signal ?? 'unknown')} · output discarded (${s.command.stdoutBytes + s.command.stderrBytes} bytes)</p>${s.findings.length ? `<ul>${s.findings.map(f => `<li><strong>${esc(f.kind)}:</strong> ${esc(describeFinding(f))}</li>`).join('')}</ul>` : '<p class="empty">The declared local contract was satisfied for this scenario.</p>'}<div class="scroll"><table><thead><tr><th>#</th><th>Destination</th><th>Method</th><th>Action</th><th>Marker labels</th><th>Bytes</th></tr></thead><tbody>${s.requests.map(r => `<tr><td>${r.index}</td><td>${esc(r.service)}</td><td>${esc(r.method)}</td><td>${esc(r.action)}${r.status ? ' ' + r.status : ''}${r.delayMs ? ' ' + r.delayMs + 'ms' : ''}</td><td>${esc(r.markerHits.join(', ') || 'none detected')}</td><td>${r.bytes}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>OutageFence — ${esc(report.name)}</title><style>${style}</style></head><body><header><div class="top"><div class="brand">◫ OutageFence <span style="font-size:12px;font-weight:500;letter-spacing:0">by Slanta Cause</span></div><span class="badge">LOCAL SYNTHETIC EVIDENCE</span></div><div class="eyebrow">Failure paths deserve their own tests</div><h1>${esc(report.name)}</h1><p>A working fallback can still send data to the wrong destination. This report tests explicit data boundaries under controlled HTTP failures.</p></header><main><div class="stats">${[['PASS', counts.PASS], ['FAIL', counts.FAIL], ['INCONCLUSIVE', counts.INCONCLUSIVE], ['ERROR', counts.ERROR]].map(([k, n]) => `<div class="stat"><strong class="${k.toLowerCase()}">${n}</strong><span>${k === 'PASS' ? 'Contracts satisfied' : k === 'FAIL' ? 'Contract violations' : k === 'INCONCLUSIVE' ? 'Coverage gaps' : 'Execution errors'}</span></div>`).join('')}</div><h2>Matrix result: <span class="${status.toLowerCase()}">${status}</span></h2><p class="lead">${report.summary.total} of ${report.expectedScenarios} scenarios completed. Numbers show calls received by each destination. ⚡ marks faults actually injected.${report.interrupted ? ' The matrix was interrupted.' : ''}</p><div class="scroll"><table><thead><tr><th>Scenario</th><th>Result</th>${services.map(n => `<th>${esc(n)}</th>`).join('')}<th>Duration</th></tr></thead><tbody>${rows}</tbody></table></div><h2>Inspect the evidence</h2><div class="filters" aria-label="Filter scenario details">${[['all', 'All scenarios'], ['FAIL', 'Violations'], ['INCONCLUSIVE', 'Coverage gaps'], ['ERROR', 'Errors']].map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${k === 'all'}">${label}</button>`).join('')}</div><p id="empty-filter" class="empty" hidden>No scenarios in this category.</p>${cards}<section class="limits"><h2>What this result establishes</h2><ul>${report.boundaries.map(b => `<li>${esc(b)}</li>`).join('')}</ul><p>Each marker must be observed at its declared positive-control destination. An unused fault or missing marker produces INCONCLUSIVE. Raw payloads, headers, URL paths, marker values, and child output are never written into this report.</p></section><div class="provenance">Observed ${esc(report.observedAt)} · OutageFence ${esc(report.toolVersion)} · Node ${esc(report.provenance.nodeVersion)} · ${esc(report.provenance.platform)}<br>Configuration SHA-256: <code>${esc(report.provenance.configSha256)}</code><br>Command SHA-256: <code>${esc(report.provenance.commandSha256)}</code><br>Declared source files: ${report.provenance.inputsBefore.length} · changed during run: ${report.provenance.inputsChanged ? 'yes' : 'no'}<br>Source fingerprinting covers only declared files; environment and undeclared inputs may change behavior.</div><footer>No external fonts, scripts, analytics, or network resources.</footer></main><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{const filter=button.dataset.filter;let shown=0;document.querySelectorAll('.scenario').forEach(card=>{card.hidden=filter!=='all'&&card.dataset.status!==filter;if(!card.hidden)shown++});document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.getElementById('empty-filter').hidden=shown!==0}));</script></body></html>`;
}

export async function writeReports(report, directory) {
  await mkdir(directory, { recursive: true });
  const contents = { 'report.json': JSON.stringify(report, null, 2) + '\n', 'report.html': renderHtml(report), 'report.md': renderMarkdown(report), 'junit.xml': renderJUnit(report) };
  for (const [name, content] of Object.entries(contents)) {
    const target = join(directory, name);
    const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;
    await writeFile(temporary, content, { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  }
  return Object.fromEntries(Object.keys(contents).map(name => [name, join(directory, name)]));
}
