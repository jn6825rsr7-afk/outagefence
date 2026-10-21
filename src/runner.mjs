import { spawn } from 'node:child_process';
import { basename, resolve, relative, sep } from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';
import { validateConfig } from './config.mjs';
import { createEndpoints } from './endpoints.mjs';
import { createMarkers, markerEnv, hash } from './markers.mjs';

const RUNTIME_ENV = ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL'];

function environment(config, endpoints, markers, scenario) {
  const env = { CI: 'true' };
  for (const k of [...RUNTIME_ENV, ...config.inheritEnv]) if (process.env[k] !== undefined) env[k] = process.env[k];
  Object.assign(env, config.env, markerEnv(markers), { OUTAGEFENCE_SCENARIO: scenario.id });
  for (const [name, service] of Object.entries(config.services)) env[service.env] = endpoints.urls[name];
  return env;
}

// A command is explicitly configured by the developer. It runs with ordinary OS
// permissions. Shell interpolation is never used. This is not a process sandbox.
export function runCommand(command, options) {
  return new Promise(resolveResult => {
    const started = performance.now();
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let spawnFailed = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const child = spawn(command[0] === '$NODE' ? process.execPath : command[0], command.slice(1), {
      cwd: options.cwd, env: options.env, shell: false,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    const kill = () => {
      if (!child.pid) return;
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch (error) { if (error.code !== 'ESRCH') spawnFailed = true; }
    };
    const onAbort = () => { aborted = true; kill(); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, options.timeoutMs);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    child.stdout.on('data', data => { stdoutBytes += data.length; });
    child.stderr.on('data', data => { stderrBytes += data.length; });
    child.on('error', () => { spawnFailed = true; });
    child.on('exit', () => { kill(); }); // terminate any surviving members of the test's process group
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolveResult({ exitCode: code, signal, timedOut, aborted, spawnFailed,
        durationMs: Math.round(performance.now() - started), stdoutBytes, stderrBytes });
    });
  });
}

async function fingerprintInputs(paths, cwd) {
  const root = await realpath(cwd);
  const result = [];
  for (const input of paths) {
    const file = resolve(root, input);
    const stat = await lstat(file);
    const resolved = await realpath(file);
    const rel = relative(root, resolved);
    if (rel.startsWith(`..${sep}`) || rel === '..' || stat.isSymbolicLink() || !stat.isFile() || stat.size > 16777216) {
      throw new Error('Declared input must be a regular file within the working directory, at most 16 MiB');
    }
    result.push({ path: input, sha256: hash(await readFile(file)) });
  }
  return result;
}

export function evaluateScenario(config, scenario, endpoints, command) {
  const findings = [];
  const add = (kind, code, detail) => findings.push({ kind, code, ...detail });
  for (const request of endpoints.records) {
    for (const marker of request.markerHits) {
      if (!config.markers[marker].allowedServices.includes(request.service)) {
        add('violation', 'forbidden-marker', { service: request.service, marker, request: request.index });
      }
    }
  }
  for (const [name, service] of Object.entries(config.services)) {
    const observed = endpoints.coverage[name];
    const max = scenario.maxCalls[name] ?? service.maxCalls;
    if (observed.calls > max) add('violation', 'call-budget', { service: name, calls: observed.calls, maximum: max });
    if (scenario.requiredServices.includes(name) && !observed.calls) add('gap', 'service-not-exercised', { service: name });
    if (scenario.faults[name] && !observed.faultsInjected) add('gap', 'fault-not-exercised', { service: name });
  }
  for (const [marker, rule] of Object.entries(config.markers)) {
    for (const service of rule.requiredIn) {
      if (!endpoints.records.some(r => r.service === service && r.markerHits.includes(marker))) {
        add('gap', 'positive-control-missing', { service, marker });
      }
    }
  }
  for (const code of endpoints.problems) add('gap', code, {});
  if (endpoints.records.some(r => r.capture !== 'complete')) add('gap', 'capture-incomplete', {});
  if (command.timedOut) add('error', 'command-timeout', {});
  else if (command.aborted) add('error', 'interrupted', {});
  else if (command.spawnFailed) add('error', 'command-start-failed', {});
  else if (command.exitCode !== 0) add('error', 'command-failed', { exitCode: command.exitCode, signal: command.signal });
  // All findings remain visible even when a more serious state takes precedence.
  const status = findings.some(f => f.kind === 'violation') ? 'FAIL'
    : findings.some(f => f.kind === 'error') ? 'ERROR'
      : findings.some(f => f.kind === 'gap') ? 'INCONCLUSIVE' : 'PASS';
  return { id: scenario.id, baseline: Object.keys(scenario.faults).length === 0, status,
    faults: scenario.faults, command, coverage: endpoints.coverage, requests: endpoints.records, findings };
}

export function summarize(scenarios) {
  const counts = { PASS: 0, FAIL: 0, ERROR: 0, INCONCLUSIVE: 0 };
  for (const s of scenarios) counts[s.status]++;
  const status = counts.FAIL ? 'FAIL' : counts.ERROR ? 'ERROR' : counts.INCONCLUSIVE ? 'INCONCLUSIVE' : 'PASS';
  return { status, counts, total: scenarios.length };
}

export async function runMatrix(input, options = {}) {
  const config = validateConfig(input);
  const cwd = resolve(options.cwd ?? process.cwd());
  const before = await fingerprintInputs(config.inputs, cwd);
  const scenarios = [];
  for (const scenario of config.scenarios) {
    if (options.signal?.aborted) break;
    const markers = createMarkers(Object.keys(config.markers));
    const endpoints = await createEndpoints(config, scenario, markers);
    let command;
    try {
      command = await runCommand(config.command, { cwd,
        env: environment(config, endpoints, markers, scenario), timeoutMs: config.timeoutMs, signal: options.signal });
      await pause(config.settleMs);
    } finally {
      await endpoints.close();
    }
    const result = evaluateScenario(config, scenario, endpoints, command);
    scenarios.push(result);
    options.onScenario?.(result);
  }
  let after;
  try { after = await fingerprintInputs(config.inputs, cwd); } catch { after = null; }
  const inputsChanged = after === null || JSON.stringify(before) !== JSON.stringify(after);
  if (inputsChanged) {
    for (const s of scenarios) {
      s.findings.push({ kind: 'gap', code: 'declared-inputs-changed' });
      if (s.status === 'PASS') s.status = 'INCONCLUSIVE';
    }
  }
  const summary = summarize(scenarios);
  const interrupted = scenarios.length < config.scenarios.length;
  if (interrupted && summary.status === 'PASS') summary.status = 'ERROR';
  return { schemaVersion: 1, tool: 'OutageFence', author: 'Slanta Cause', toolVersion: '0.1.0-rc.1',
    observedAt: new Date().toISOString(), name: config.name,
    evidence: 'local-synthetic-http',
    provenance: { configSha256: hash(JSON.stringify(config)), commandSha256: hash(JSON.stringify(config.command)),
      executable: basename(config.command[0]), nodeVersion: process.version, platform: process.platform,
      inputsBefore: before, inputsAfter: after, inputsChanged },
    boundaries: ['Only requests received by declared local endpoints are observed.',
      'Synthetic marker matching is not general data-flow tracking.',
      'The child command is not network-isolated or sandboxed.',
      'A passing scenario establishes only its declared local contract.'],
    expectedScenarios: config.scenarios.length, interrupted, summary, scenarios };
}
