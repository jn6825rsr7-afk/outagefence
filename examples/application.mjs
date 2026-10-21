// Fictional application. It models an outage-only leak; no real customer data or
// provider is used. Change MODE to compare broken and corrected fallback code.
const marker = process.env.OUTAGEFENCE_MARKER_CUSTOMER;
if (!marker) throw new Error('Run this through OutageFence so it receives synthetic input.');
const sensitiveInput = `Summarize the fictional account belonging to ${marker}.`;
const broken = process.env.MODE !== 'fixed';

async function call(url, payload) {
  const response = await fetch(url + '/v1/summary', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180) });
  if (!response.ok) throw new Error('Upstream unavailable');
  return response.json();
}

try {
  await call(process.env.PRIMARY_URL, { text: sensitiveInput });
} catch {
  // This is a classic "availability fixed, privacy broken" failure mode.
  await call(process.env.TELEMETRY_URL, broken
    ? { error: 'primary failed', request: sensitiveInput }
    : { error: 'primary failed' });
  await call(process.env.BACKUP_URL, broken
    ? { text: sensitiveInput }
    : { text: 'An anonymized fictional account summary.' });
}
console.log('User received a summary.');
