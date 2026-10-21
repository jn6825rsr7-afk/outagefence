#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { readConfig } from '../src/config.mjs';
import { runMatrix } from '../src/runner.mjs';
import { writeReports } from '../src/report.mjs';
import { runDemo, initialize } from '../src/demo.mjs';

const HELP = `OutageFence 0.1.0-rc.2 by Slanta Cause — test data boundaries when dependencies fail

Usage:
  outagefence demo [--out DIRECTORY] [--json]
  outagefence init [DIRECTORY]
  outagefence run [--config FILE] [--out DIRECTORY] [--json]
  outagefence --help
  outagefence --version

run executes the command declared in the config, once per scenario.
Use synthetic input and a disposable test environment. The child is not sandboxed.

Exit codes: 0 contract satisfied / demo demonstrated; 1 violation;
            2 usage or execution error; 3 inconclusive coverage; 130 interrupted.
`;

function parse(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  if (args.length === 1 && args[0] === '--version') return { version: true };
  const mode = args.shift();
  if (!['demo', 'init', 'run'].includes(mode)) throw new Error('Choose run, demo, or init. See --help.');
  const result = { mode };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--json' && mode !== 'init') {
      if (result.json) throw new Error('Duplicate --json');
      result.json = true;
    } else if ((arg === '--config' && mode === 'run') || (arg === '--out' && mode !== 'init')) {
      const key = arg.slice(2);
      if (result[key] !== undefined || !args[0] || args[0].startsWith('--')) throw new Error(`${arg} needs one value and may appear once`);
      result[key] = args.shift();
    } else if (mode === 'init' && !arg.startsWith('-') && !result.directory) result.directory = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);
try {
  const args = parse(process.argv.slice(2));
  if (args.help) console.log(HELP);
  else if (args.version) console.log('0.1.0-rc.2');
  else if (args.mode === 'init') {
    const target = resolve(args.directory ?? 'outagefence-example');
    await initialize(target);
    console.log(`Created a runnable example at ${target}\nRun: outagefence run --config ${JSON.stringify(target + '/outagefence.json')}`);
  } else if (args.mode === 'demo') {
    const out = resolve(args.out ?? `outagefence-demo-${Date.now()}`);
    const result = await runDemo(out, { signal: controller.signal,
      onScenario: args.json ? undefined : (mode, s) => console.error(`${s.status.padEnd(12)} ${mode}/${s.id}`) });
    if (args.json) console.log(JSON.stringify({ ...result, directory: out }));
    else console.log(`${result.demonstrated ? 'Demo verified' : 'Demo did not produce the expected contrast'}. Open ${out}/index.html`);
    process.exitCode = controller.signal.aborted ? 130 : result.demonstrated ? 0 : 2;
  } else {
    const file = resolve(args.config ?? 'outagefence.json');
    const config = await readConfig(file);
    const out = resolve(args.out ?? `outagefence-results-${Date.now()}`);
    const report = await runMatrix(config, { cwd: dirname(file), signal: controller.signal,
      onScenario: args.json ? undefined : s => console.error(`${s.status.padEnd(12)} ${s.id}`) });
    await writeReports(report, out);
    if (args.json) console.log(JSON.stringify(report));
    else console.log(`${report.summary.status}: ${report.summary.total} scenarios. Open ${out}/report.html`);
    process.exitCode = controller.signal.aborted ? 130 : ({ PASS: 0, FAIL: 1, ERROR: 2, INCONCLUSIVE: 3 })[report.summary.status];
  }
} catch (error) {
  // Do not echo config contents, child output, or arbitrary nested error details.
  console.error(`OutageFence: ${error.name === 'ConfigError' || error.code === undefined ? error.message : 'Unable to read or write a required local file.'}`);
  process.exitCode = controller.signal.aborted ? 130 : 2;
} finally {
  process.removeListener('SIGINT', abort);
  process.removeListener('SIGTERM', abort);
}
