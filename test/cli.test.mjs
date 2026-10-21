import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/outagefence.mjs', import.meta.url));
function invoke(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('help and version run without config or side effects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outagefence-cli-'));
  try {
    const help = await invoke(['--help'], { cwd: directory });
    assert.equal(help.code, 0); assert.match(help.stdout, /Usage:/);
    const version = await invoke(['--version'], { cwd: directory });
    assert.equal(version.code, 0); assert.match(version.stdout, /^0\.1\.0-rc\.2/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unknown flags and missing flag values are usage errors', async () => {
  for (const args of [['run', '--out'], ['run', '--quiet'], ['demo', '--config', 'x'], ['run', '--json', '--json']]) {
    const result = await invoke(args);
    assert.equal(result.code, 2); assert.match(result.stderr, /OutageFence:/);
  }
});

test('a fresh initialized project runs from another directory and emits four formats', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'outagefence-install-'));
  try {
    const target = join(directory, 'example');
    assert.equal((await invoke(['init', target])).code, 0);
    const existing = await readFile(join(target, 'application.mjs'), 'utf8');
    assert.equal((await invoke(['init', target])).code, 2, 'must not overwrite an existing example');
    assert.equal(await readFile(join(target, 'application.mjs'), 'utf8'), existing);
    const output = join(directory, 'results');
    const result = await invoke(['run', '--config', join(target, 'outagefence.json'), '--out', output, '--json'], { cwd: tmpdir() });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.summary.counts.PASS, 6);
    for (const name of ['report.json', 'report.html', 'report.md', 'junit.xml']) assert.ok((await readFile(join(output, name))).length);
    const c = JSON.parse(await readFile(join(target, 'outagefence.json'), 'utf8'));
    c.env.MODE = 'broken'; await writeFile(join(target, 'outagefence.json'), JSON.stringify(c));
    const broken = await invoke(['run', '--config', join(target, 'outagefence.json'), '--out', output, '--json']);
    assert.equal(broken.code, 1);
    assert.equal(JSON.parse(broken.stdout).summary.counts.FAIL, 5);
    c.command = ['$NODE', '-e', 'process.exit(0)']; c.inputs = []; c.scenarios = [{ id: 'baseline' }];
    await writeFile(join(target, 'outagefence.json'), JSON.stringify(c));
    const inconclusive = await invoke(['run', '--config', join(target, 'outagefence.json'), '--out', output, '--json']);
    assert.equal(inconclusive.code, 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
