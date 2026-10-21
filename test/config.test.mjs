import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.mjs';

export const base = () => ({ version: 1, name: 'Contract', command: ['$NODE', '-e', 'process.exit(0)'],
  services: { primary: { env: 'PRIMARY_URL' }, backup: { env: 'BACKUP_URL' } },
  markers: { customer: { allowedServices: ['primary'], requiredIn: ['primary'] } },
  scenarios: [{ id: 'baseline' }] });

test('validates and normalizes without mutating input', () => {
  const input = base();
  const result = validateConfig(input);
  assert.equal(result.timeoutMs, 10000);
  assert.equal(input.timeoutMs, undefined);
  assert.equal(result.services.primary.maxCalls, 10);
});

const invalid = [
  ['typo in a field', c => { c.scenarios[0].requredServices = ['primary']; }],
  ['missing positive control', c => { c.markers.customer.requiredIn = []; }],
  ['required forbidden marker', c => { c.markers.customer.requiredIn = ['backup']; }],
  ['unknown marker service', c => { c.markers.customer.allowedServices = ['elsewhere']; }],
  ['no baseline', c => { c.scenarios[0].faults = { primary: { type: 'drop' } }; }],
  ['invalid status', c => { c.scenarios.push({ id: 'error', faults: { primary: { type: 'http', status: 200 } } }); }],
  ['meaningless fault field', c => { c.scenarios.push({ id: 'error', faults: { primary: { type: 'drop', delayMs: 100 } } }); }],
  ['unknown fault service', c => { c.scenarios.push({ id: 'error', faults: { nowhere: { type: 'drop' } } }); }],
  ['duplicate scenario', c => { c.scenarios.push({ id: 'baseline' }); }],
  ['duplicate service env', c => { c.services.backup.env = 'PRIMARY_URL'; }],
  ['reserved endpoint env', c => { c.services.backup.env = 'NODE_OPTIONS'; }],
  ['endpoint env override', c => { c.env = { PRIMARY_URL: 'https://example.invalid' }; }],
  ['inherit endpoint env override', c => { c.inheritEnv = ['PRIMARY_URL']; }],
  ['duplicate marker env', c => { c.markers['customer-id'] = c.markers.customer; c.markers.customer_id = c.markers.customer; }],
  ['header injection', c => { c.services.primary.response = { headers: { foo: 'one\r\ntwo' } }; }],
  ['unencodable header', c => { c.services.primary.response = { headers: { foo: '🥨' } }; }],
  ['XML-invalid title', c => { c.name = 'bad\u0000title'; }],
  ['ambiguous response framing', c => { c.services.primary.response = { headers: { 'Content-Length': '999' } }; }],
  ['input traversal', c => { c.inputs = ['../secret']; }],
  ['negative call budget', c => { c.services.primary.maxCalls = -1; }],
  ['empty command', c => { c.command = []; }],
  ['oversized matrix', c => { c.scenarios = Array.from({ length: 65 }, (_, i) => ({ id: `scenario-${i}` })); }]
];
for (const [name, change] of invalid) test(`rejects ${name}`, () => {
  const input = base(); change(input); assert.throws(() => validateConfig(input), { name: 'ConfigError' });
});
