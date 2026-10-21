(() => {
  let condition = 'outage';
  let variant = 'broken';
  const get = id => document.getElementById(id);
  function update() {
    const outage = condition === 'outage';
    const leaking = outage && variant === 'broken';
    get('primary-label').textContent = outage ? 'Unavailable · 503' : 'Synthetic value received';
    get('primary-node').className = `node ${outage ? 'warning' : 'safe'}`;
    get('backup-label').textContent = outage ? leaking ? 'Original value received' : 'Anonymized input + error code' : 'Not called';
    get('backup-node').className = `node ${outage ? leaking ? 'warning' : 'safe' : 'idle'}`;
    get('result-state').textContent = leaking ? 'BOUNDARY VIOLATION' : 'DECLARED CONTRACT SATISFIED';
    get('result-state').className = `result-state ${leaking ? '' : 'safe'}`;
    get('result-title').textContent = !outage ? 'Both versions look healthy on the normal path.' : leaking
      ? 'The user gets a summary. The private value escapes.' : 'The fallback completes. The original value stays at the primary.';
    get('result-description').textContent = !outage ? 'The primary returns successfully, so the fallback and error collector never run. The normal baseline alone cannot distinguish the two versions.' : leaking
      ? 'The broken fallback copies the synthetic customer input to the backup and error collector. Both are forbidden destinations in this contract.'
      : 'The corrected fallback sends anonymized input to the backup and an error code to diagnostics. OutageFence observes the required paths without finding the protected marker there.';
    get('result-link').href = variant === 'broken' ? 'demo/broken/report.html' : 'demo/fixed/report.html';
    get('result-link').textContent = variant === 'broken' ? 'Open captured leaking-version report →' : 'Open captured corrected-version report →';
    document.querySelectorAll('[data-condition]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.condition === condition)));
    document.querySelectorAll('[data-variant]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.variant === variant)));
  }
  document.querySelectorAll('[data-condition]').forEach(b => b.addEventListener('click', () => { condition = b.dataset.condition; update(); }));
  document.querySelectorAll('[data-variant]').forEach(b => b.addEventListener('click', () => { variant = b.dataset.variant; update(); }));
  update();
})();
