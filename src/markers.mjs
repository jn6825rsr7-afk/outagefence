import { createHash, randomBytes } from 'node:crypto';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function createMarkers(names) {
  return Object.fromEntries(names.map(name => [name, `OF_${randomBytes(24).toString('hex')}_END`]));
}

// Exact synthetic values only. No probabilistic PII classifier or claim of taint tracking.
export function markerHits(parts, markers) {
  const haystacks = parts.map(p => Buffer.isBuffer(p) ? p.toString('utf8') : String(p));
  const hits = [];
  for (const [name, value] of Object.entries(markers)) {
    const variants = [value, Buffer.from(value).toString('base64'), Buffer.from(value).toString('base64url'),
      Buffer.from(value).toString('hex'), [...value].map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')];
    if (haystacks.some(part => variants.some(variant => part.includes(variant)))) hits.push(name);
  }
  return hits;
}

export function markerEnv(markers) {
  return Object.fromEntries(Object.entries(markers).map(([name, value]) => [`OUTAGEFENCE_MARKER_${name.toUpperCase().replaceAll('-', '_')}`, value]));
}
