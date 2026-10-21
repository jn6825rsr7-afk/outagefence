import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMatrix } from '../src/runner.mjs';
import { createMarkers, markerHits } from '../src/markers.mjs';
import { createEndpoints } from '../src/endpoints.mjs';
import { validateConfig } from '../src/config.mjs';
import { renderHtml, renderMarkdown, renderJUnit, writeReports } from '../src/report.mjs';

const source = `
const secret = process.env.OUTAGEFENCE_MARKER_CUSTOMER;
const send = async (url, value, headers = {}) => fetch(url, {method:'POST',headers,body:value});
const first = await send(process.env.PRIMARY_URL + '/private?value=' + secret, secret, {'x-canary': secret});
if (!first.ok) await send(process.env.BACKUP_URL, process.env.MODE === 'leak' ? secret : 'redacted');
`;
const configuration = (code = source) => ({ version: 1, name: 'Regression fixture', command: ['$NODE', '-e', code],
  timeoutMs: 3000, settleMs: 0, env: { MODE: 'fixed' },
  services: { primary: { env: 'PRIMARY_URL', maxCalls: 2 }, backup: { env: 'BACKUP_URL', maxCalls: 2 } },
  markers: { customer: { allowedServices: ['primary'], requiredIn: ['primary'] } },
  scenarios: [{ id: 'baseline' }, { id: 'unavailable', faults: { primary: { type: 'http', status: 503 } }, requiredServices: ['backup'] }] });

test('actual application leak is visible only after the primary fails', async () => {
  const c = configuration(); c.env.MODE = 'leak';
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'FAIL');
  assert.equal(report.scenarios[0].status, 'PASS');
  const failed = report.scenarios[1];
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.command.exitCode, 0, 'application still succeeds despite the leak');
  assert.ok(failed.findings.some(f => f.code === 'forbidden-marker' && f.service === 'backup'));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /OF_[a-f0-9]{48}_END/);
  assert.doesNotMatch(serialized, /private\?value|x-canary|redacted/);
});

test('corrected fallback meets the contract and calls the fallback', async () => {
  const report = await runMatrix(configuration());
  assert.equal(report.summary.status, 'PASS');
  assert.equal(report.scenarios[1].coverage.backup.calls, 1);
  assert.equal(report.scenarios[1].coverage.primary.faultsInjected, 1);
});

test('missing synthetic input cannot produce a green result', async () => {
  const c = configuration(`await fetch(process.env.PRIMARY_URL);`); c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'INCONCLUSIVE');
  assert.ok(report.scenarios[0].findings.some(f => f.code === 'positive-control-missing'));
});

test('unused fault cannot produce a green result', async () => {
  const c = configuration(); c.scenarios[1] = { id: 'unused', faults: { backup: { type: 'drop' } } };
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'INCONCLUSIVE');
  assert.ok(report.scenarios[1].findings.some(f => f.code === 'fault-not-exercised'));
});

test('afterCalls is a deterministic sequence and must actually be reached', async () => {
  const c = configuration(); c.scenarios[1].faults.primary.afterCalls = 2;
  const report = await runMatrix(c);
  assert.equal(report.scenarios[1].status, 'INCONCLUSIVE');
});

test('retry budgets catch successful request amplification', async () => {
  const c = configuration(`${source}\nawait send(process.env.PRIMARY_URL, secret);`);
  c.scenarios = [{ id: 'baseline', maxCalls: { primary: 1 } }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'FAIL');
  assert.ok(report.scenarios[0].findings.some(f => f.code === 'call-budget'));
});

test('a failing command is ERROR even when it sends the marker', async () => {
  const c = configuration(`${source}\nprocess.exitCode=4;`); c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'ERROR');
  assert.equal(report.scenarios[0].command.exitCode, 4);
});

test('command deadline terminates the process and reports ERROR', async () => {
  const c = configuration('setInterval(()=>{},1000);'); c.timeoutMs = 150; c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'ERROR');
  assert.equal(report.scenarios[0].command.timedOut, true);
});

test('missing executable reports ERROR without throwing or hanging', async () => {
  const c = configuration(); c.command = ['outagefence-no-such-executable-51a9']; c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'ERROR');
  assert.equal(report.scenarios[0].command.spawnFailed, true);
});

test('arbitrary parent credentials are not inherited by default', async () => {
  const key = 'OUTAGEFENCE_TEST_SECRET'; process.env[key] = 'should-not-be-in-child';
  try {
    const c = configuration(`if(process.env.${key})process.exit(7);${source}`); c.scenarios = [{ id: 'baseline' }];
    const report = await runMatrix(c);
    assert.equal(report.summary.status, 'PASS');
  } finally { delete process.env[key]; }
});

test('marker matches plaintext and documented standalone encodings', () => {
  const m = createMarkers(['customer']);
  for (const text of [m.customer, Buffer.from(m.customer).toString('base64'), Buffer.from(m.customer).toString('hex'),
    [...m.customer].map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')]) {
    assert.deepEqual(markerHits([text], m), ['customer']);
  }
  assert.deepEqual(markerHits(['not the marker'], m), []);
});

test('oversized capture remains inconclusive, never absence-of-leak proof', async () => {
  const c = configuration(`await fetch(process.env.PRIMARY_URL,{method:'POST',body:process.env.OUTAGEFENCE_MARKER_CUSTOMER});try{await fetch(process.env.BACKUP_URL,{method:'POST',body:'x'.repeat(5000)})}catch{}`);
  c.maxBodyBytes = 1024; c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'INCONCLUSIVE');
  assert.ok(report.scenarios[0].findings.some(f => f.code === 'body-limit'));
});

test('compressed body is explicitly incomplete instead of silently accepted', async () => {
  const c = configuration(`${source}\nawait send(process.env.BACKUP_URL,'opaque',{'content-encoding':'gzip'});`);
  c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'INCONCLUSIVE');
  assert.ok(report.scenarios[0].findings.some(f => f.code === 'unsupported-content-encoding'));
});

test('capture limit cannot hide later requests behind PASS', async () => {
  const c = configuration(`${source}\nawait send(process.env.BACKUP_URL,'safe');`);
  c.scenarios = [{ id: 'baseline' }]; c.maxRequests = 1;
  const report = await runMatrix(c);
  assert.equal(report.summary.status, 'INCONCLUSIVE');
  assert.ok(report.scenarios[0].findings.some(f => f.code === 'request-limit'));
});

test('raw child output and request paths never enter report artifacts; HTML escapes configuration', async () => {
  const c = configuration(`${source}\nconsole.log('NEVER_RETAIN_THIS');`);
  c.name = '<script>alert("bad")</script>'; c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  const html = renderHtml(report);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /NEVER_RETAIN_THIS|OF_[a-f0-9]{48}_END|private\?value/);
  const directory = await mkdtemp(join(tmpdir(), 'outagefence-report-'));
  try {
    const paths = await writeReports(report, directory);
    for (const file of Object.values(paths)) assert.doesNotMatch(await readFile(file, 'utf8'), /NEVER_RETAIN_THIS|OF_[a-f0-9]{48}_END/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('all fault modes work against real local HTTP', async () => {
  const config = validateConfig(configuration());
  const markers = createMarkers(['customer']);
  for (const fault of [{ type: 'http', status: 429 }, { type: 'drop' }, { type: 'malformed' }, { type: 'delay', delayMs: 50 }]) {
    const endpoints = await createEndpoints(config, { faults: { primary: { ...fault, afterCalls: 0 } } }, markers);
    try {
      const started = performance.now();
      let response;
      try { response = await fetch(endpoints.urls.primary, { method: 'POST', body: markers.customer }); } catch {}
      if (fault.type === 'http') assert.equal(response.status, 429);
      if (fault.type === 'drop') assert.equal(response, undefined);
      if (fault.type === 'malformed') await assert.rejects(() => response.json());
      if (fault.type === 'delay') assert.ok(performance.now() - started >= 40);
      assert.equal(endpoints.coverage.primary.faultsInjected, 1);
      assert.deepEqual(endpoints.records[0].markerHits, ['customer']);
    } finally { await endpoints.close(); }
  }
});

test('declared source changes invalidate previously green scenarios', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outagefence-source-'));
  try {
    await writeFile(join(directory, 'input.txt'), 'before');
    const c = configuration(`import { writeFile } from 'node:fs/promises';${source}\nawait writeFile('input.txt','after');`);
    c.scenarios = [{ id: 'baseline' }]; c.inputs = ['input.txt'];
    const report = await runMatrix(c, { cwd: directory });
    assert.equal(report.summary.status, 'INCONCLUSIVE');
    assert.equal(report.provenance.inputsChanged, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('inconclusive coverage is a JUnit failure, not a skip', async () => {
  const c = configuration('process.exit(0);'); c.scenarios = [{ id: 'baseline' }];
  const report = await runMatrix(c);
  assert.match(renderJUnit(report), /<failure type="coverage"/);
  assert.match(renderJUnit(report), /skipped="0"/);
  assert.match(renderMarkdown(report), /INCONCLUSIVE/);
});
