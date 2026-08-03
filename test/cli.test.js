import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../src/cli.js', import.meta.url));

test('CLI keeps raw observations outside the public run tree', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-memory-cli-'));
  try {
    const inputPath = path.join(fixtureRoot, 'workspaces.jsonl');
    const source = 'const GeneratedComposition=()=> <div>PRIVATE TRANSCRIPT</div>;';
    const input = JSON.stringify({
      width: 1080,
      height: 1920,
      fps: 60,
      length: 1000,
      tracks: [{
        id: 'private-track',
        type: 'composition',
        start: 0,
        length: 1000,
        source,
        meta: { prompt: 'secret user prompt' },
      }],
    });
    await fs.writeFile(inputPath, `${input}\n`, 'utf8');

    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      '--input', inputPath,
    ], { cwd: fixtureRoot });
    const runId = stdout.match(/^Run: ([a-f0-9]{20})$/m)?.[1];
    assert.ok(runId);

    const publicRun = path.join(fixtureRoot, 'runs', runId);
    const privateRun = path.join(fixtureRoot, '.private-runs', runId);
    await assert.rejects(
      fs.access(path.join(publicRun, 'observations.private.jsonl')),
      { code: 'ENOENT' },
    );

    const publicObservations = await fs.readFile(path.join(publicRun, 'observations.jsonl'), 'utf8');
    const privateObservations = await fs.readFile(path.join(privateRun, 'observations.private.jsonl'), 'utf8');
    assert.equal(publicObservations.includes('PRIVATE TRANSCRIPT'), false);
    assert.equal(publicObservations.includes('secret user prompt'), false);
    assert.ok(privateObservations.includes('PRIVATE TRANSCRIPT'));
    assert.ok(privateObservations.includes('secret user prompt'));
  } finally {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});
