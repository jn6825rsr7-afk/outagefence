import { readFile } from 'node:fs/promises';
import { validateHeaderName, validateHeaderValue } from 'node:http';

export class ConfigError extends Error {
  constructor(message) { super(message); this.name = 'ConfigError'; }
}
const fail = message => { throw new ConfigError(message); };
const object = (v, at) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${at} must be an object`);
};
const keys = (v, allowed, at) => {
  object(v, at);
  for (const key of Object.keys(v)) if (!allowed.includes(key)) fail(`${at}: unknown field ${key}`);
};
const str = (v, at, re = null) => {
  if (typeof v !== 'string' || !v.length || v.length > 1024 || (re && !re.test(v))) fail(`${at} is invalid`);
};
const integer = (v, min, max, at) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail(`${at} must be an integer from ${min} to ${max}`);
};
const ID = /^[a-z][a-z0-9_-]{0,47}$/;
const ENV = /^[A-Z][A-Z0-9_]{0,63}$/;
const UNSAFE_ENV = /^(?:NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|BASH_ENV|ENV|SHELLOPTS|IFS|PATH|HOME|USERPROFILE|SYSTEMROOT|COMSPEC)$/;
function envName(value, at) {
  str(value, at, ENV);
  if (UNSAFE_ENV.test(value) || value.startsWith('OUTAGEFENCE_')) fail(`${at}: reserved environment variable`);
}
const list = (v, at, max = 64) => {
  if (!Array.isArray(v) || v.length > max) fail(`${at} must be an array of at most ${max} items`);
};
function references(v, serviceNames, at) {
  list(v, at);
  if (new Set(v).size !== v.length) fail(`${at} contains duplicates`);
  for (const name of v) if (!serviceNames.includes(name)) fail(`${at}: unknown service ${name}`);
}

export function validateConfig(input) {
  const c = structuredClone(input);
  keys(c, ['version', 'name', 'command', 'env', 'inheritEnv', 'inputs', 'timeoutMs', 'settleMs', 'maxBodyBytes', 'maxRequests', 'services', 'markers', 'scenarios'], 'config');
  if (c.version !== 1) fail('version must be 1');
  str(c.name, 'name');
  if (/[\x00-\x1f\x7f]/.test(c.name)) fail('name must not contain control characters');
  list(c.command, 'command', 128);
  if (!c.command.length) fail('command must include an executable');
  c.command.forEach((arg, i) => str(arg, `command[${i}]`));
  c.timeoutMs ??= 10000;
  c.settleMs ??= 100;
  c.maxBodyBytes ??= 1048576;
  c.maxRequests ??= 1000;
  integer(c.timeoutMs, 100, 300000, 'timeoutMs');
  integer(c.settleMs, 0, 5000, 'settleMs');
  integer(c.maxBodyBytes, 1024, 16777216, 'maxBodyBytes');
  integer(c.maxRequests, 1, 10000, 'maxRequests');
  c.env ??= {};
  object(c.env, 'env');
  for (const [k, v] of Object.entries(c.env)) { envName(k, 'env key'); str(v, `env.${k}`); }
  c.inheritEnv ??= [];
  list(c.inheritEnv, 'inheritEnv');
  c.inheritEnv.forEach(k => envName(k, 'inheritEnv key'));
  c.inputs ??= [];
  list(c.inputs, 'inputs', 128);
  c.inputs.forEach(p => {
    str(p, 'input path');
    if (p.startsWith('/') || p.includes('\\') || p.split('/').some(s => !s || s === '..' || s === '.')) fail('inputs must be relative file paths without dot segments');
  });
  object(c.services, 'services');
  const serviceNames = Object.keys(c.services);
  if (!serviceNames.length || serviceNames.length > 16) fail('services must contain 1 to 16 entries');
  const envNames = new Set();
  for (const [name, s] of Object.entries(c.services)) {
    str(name, 'service name', ID);
    keys(s, ['env', 'response', 'maxCalls'], `services.${name}`);
    envName(s.env, `services.${name}.env`);
    if (envNames.has(s.env) || Object.hasOwn(c.env, s.env) || c.inheritEnv.includes(s.env)) fail(`duplicate environment variable ${s.env}`);
    envNames.add(s.env);
    s.maxCalls ??= 10;
    integer(s.maxCalls, 0, 10000, `services.${name}.maxCalls`);
    s.response ??= { status: 200, json: { ok: true } };
    keys(s.response, ['status', 'json', 'text', 'headers'], `services.${name}.response`);
    s.response.status ??= 200;
    integer(s.response.status, 200, 599, 'response.status');
    if (Object.hasOwn(s.response, 'json') && Object.hasOwn(s.response, 'text')) fail('response may contain json or text, not both');
    if (s.response.text !== undefined && typeof s.response.text !== 'string') fail('response.text must be a string');
    if (JSON.stringify(s.response).length > 1048576) fail('response is too large');
    s.response.headers ??= {};
    object(s.response.headers, 'response.headers');
    for (const [k, v] of Object.entries(s.response.headers)) {
      if (!/^[a-zA-Z0-9-]+$/.test(k) || typeof v !== 'string' || /[\r\n]/.test(v) || /^(connection|content-length|transfer-encoding)$/i.test(k)) fail('invalid response header');
      try { validateHeaderName(k); validateHeaderValue(k, v); } catch { fail('invalid response header'); }
    }
  }
  object(c.markers, 'markers');
  const markerNames = Object.keys(c.markers);
  if (!markerNames.length || markerNames.length > 16) fail('markers must contain 1 to 16 entries');
  const markerEnvNames = new Set();
  for (const [name, m] of Object.entries(c.markers)) {
    str(name, 'marker name', ID);
    const markerEnvName = name.toUpperCase().replaceAll('-', '_');
    if (markerEnvNames.has(markerEnvName)) fail('marker names create duplicate environment variables');
    markerEnvNames.add(markerEnvName);
    keys(m, ['allowedServices', 'requiredIn'], `markers.${name}`);
    references(m.allowedServices, serviceNames, `markers.${name}.allowedServices`);
    references(m.requiredIn, serviceNames, `markers.${name}.requiredIn`);
    if (!m.requiredIn.length) fail(`markers.${name}.requiredIn must have a positive control`);
    for (const required of m.requiredIn) if (!m.allowedServices.includes(required)) fail(`marker ${name} is required in a forbidden service`);
  }
  list(c.scenarios, 'scenarios', 64);
  if (!c.scenarios.length) fail('scenarios must not be empty');
  const ids = new Set();
  let baseline = false;
  for (const [i, s] of c.scenarios.entries()) {
    keys(s, ['id', 'faults', 'requiredServices', 'maxCalls'], `scenarios[${i}]`);
    str(s.id, 'scenario.id', ID);
    if (ids.has(s.id)) fail('duplicate scenario id');
    ids.add(s.id);
    s.faults ??= {};
    object(s.faults, 'scenario.faults');
    if (!Object.keys(s.faults).length) baseline = true;
    for (const [service, f] of Object.entries(s.faults)) {
      if (!serviceNames.includes(service)) fail(`unknown fault service ${service}`);
      keys(f, ['type', 'status', 'delayMs', 'afterCalls'], `faults.${service}`);
      if (!['http', 'drop', 'delay', 'malformed'].includes(f.type)) fail('fault.type must be http, drop, delay, or malformed');
      f.afterCalls ??= 0;
      integer(f.afterCalls, 0, 10000, 'fault.afterCalls');
      if (f.type === 'http') integer(f.status, 400, 599, 'fault.status');
      else if (f.status !== undefined) fail('status is only valid for an http fault');
      if (f.type === 'delay') integer(f.delayMs, 1, 300000, 'fault.delayMs');
      else if (f.delayMs !== undefined) fail('delayMs is only valid for a delay fault');
    }
    s.requiredServices ??= [];
    references(s.requiredServices, serviceNames, 'scenario.requiredServices');
    s.maxCalls ??= {};
    object(s.maxCalls, 'scenario.maxCalls');
    for (const [name, max] of Object.entries(s.maxCalls)) {
      if (!serviceNames.includes(name)) fail(`unknown maxCalls service ${name}`);
      integer(max, 0, 10000, 'scenario.maxCalls');
    }
  }
  if (!baseline) fail('include at least one no-fault baseline scenario');
  return c;
}

export async function readConfig(file) {
  const bytes = await readFile(file);
  if (bytes.length > 2097152) fail('config exceeds 2 MiB');
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { fail('config is not valid JSON'); }
  return validateConfig(parsed);
}
