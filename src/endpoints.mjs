import { createServer } from 'node:http';
import { hash, markerHits } from './markers.mjs';

export async function createEndpoints(config, scenario, markers) {
  const records = [];
  const coverage = Object.fromEntries(Object.keys(config.services).map(name => [name, { calls: 0, faultsInjected: 0 }]));
  const problems = new Set();
  const servers = [];
  const timers = new Set();
  const urls = {};
  const started = performance.now();
  let closed = false;
  function later(fn, ms) {
    const timer = setTimeout(() => { timers.delete(timer); if (!closed) fn(); }, ms);
    timers.add(timer);
  }
  try {
    for (const [name, service] of Object.entries(config.services)) {
      const server = createServer({ maxHeaderSize: 16384 }, (req, res) => {
        const state = coverage[name];
        state.calls++;
        const serviceCall = state.calls;
        if (records.length >= config.maxRequests) {
          problems.add('request-limit');
          req.resume();
          res.writeHead(429).end();
          return;
        }
        const record = { index: records.length + 1, service: name, method: req.method,
          atMs: Math.round(performance.now() - started), bytes: 0, markerHits: [],
          capture: 'pending', action: 'pending', bodySha256: null };
        records.push(record);
        let chunks = [];
        let finished = false;
        const finish = (complete) => {
          if (finished) return;
          finished = true;
          const body = Buffer.concat(chunks);
          chunks = [];
          record.bodySha256 = hash(body);
          // Paths, query strings, headers and raw bodies are inspected in memory, never serialized.
          record.markerHits = markerHits([body, req.url ?? '', ...req.rawHeaders], markers);
          if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
            problems.add('unsupported-content-encoding');
          }
          record.capture = complete ? 'complete' : 'incomplete';
          if (!complete) problems.add('incomplete-request');
        };
        req.on('error', () => finish(false));
        req.on('aborted', () => finish(false));
        req.on('data', chunk => {
          record.bytes += chunk.length;
          if (record.bytes > config.maxBodyBytes) {
            problems.add('body-limit');
            finish(false);
            res.writeHead(413).end();
            req.destroy();
          } else if (!finished) chunks.push(chunk);
        });
        req.on('end', () => {
          finish(true);
          if (record.capture !== 'complete' || closed) return;
          const fault = scenario.faults[name];
          const injected = fault && serviceCall > fault.afterCalls;
          const send = () => {
            if (res.destroyed || res.writableEnded) return;
            const headers = { 'content-type': 'application/json', ...service.response.headers };
            res.writeHead(service.response.status, headers);
            res.end(Object.hasOwn(service.response, 'text') ? service.response.text : JSON.stringify(service.response.json ?? { ok: true }));
          };
          if (!injected) { record.action = 'response'; record.status = service.response.status; send(); return; }
          state.faultsInjected++;
          record.action = fault.type;
          if (fault.type === 'http') {
            record.status = fault.status;
            res.writeHead(fault.status, { 'content-type': 'application/json', 'retry-after': '0' });
            res.end(JSON.stringify({ error: { type: 'injected_fault', message: 'OutageFence synthetic failure' } }));
          } else if (fault.type === 'drop') {
            req.socket.destroy();
          } else if (fault.type === 'malformed') {
            record.status = 200;
            res.writeHead(200, { 'content-type': 'application/json' }).end('{invalid-json');
          } else {
            record.delayMs = fault.delayMs;
            later(send, fault.delayMs);
          }
        });
      });
      server.requestTimeout = Math.min(config.timeoutMs, 30000);
      server.headersTimeout = Math.min(config.timeoutMs, 10000);
      server.on('clientError', (_error, socket) => { problems.add('http-parser-error'); socket.destroy(); });
      server.on('upgrade', (_req, socket) => { problems.add('unsupported-protocol'); socket.destroy(); });
      server.on('connect', (_req, socket) => { problems.add('unsupported-protocol'); socket.destroy(); });
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
      urls[name] = `http://127.0.0.1:${server.address().port}`;
    }
  } catch (error) {
    for (const server of servers) { server.closeAllConnections(); server.close(); }
    throw error;
  }
  return {
    urls, records, coverage, problems,
    async close() {
      closed = true;
      for (const timer of timers) clearTimeout(timer);
      await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
    }
  };
}
