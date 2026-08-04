import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

test('public memory entry exports the canonical corpus, evaluator and pipeline functions', async () => {
  const [publicMemory, corpus, evaluator, pipeline] = await Promise.all([
    import('@cut3/agent-memory/memory'),
    import('../src/memory/corpus.js'),
    import('../src/memory/evaluate.js'),
    import('../src/memory/pipeline.js'),
  ]);

  assert.equal(publicMemory.buildCorpusCensus, corpus.buildCorpusCensus);
  assert.equal(publicMemory.evaluateMemoryCandidate, evaluator.evaluateMemoryCandidate);
  assert.equal(publicMemory.runMemoryPipeline, pipeline.runMemoryPipeline);
});

test('npm pack excludes repository-only legacy mining and dead memory modules', async () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const { stdout } = await execFileAsync(
    npm,
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32',
      timeout: 30_000,
      windowsHide: true,
    },
  );
  const manifests = JSON.parse(stdout);
  assert.equal(manifests.length, 1);
  const packedPaths = new Set(manifests[0].files.map(({ path }) => path));
  for (const publicMemoryPath of [
    'src/memory/index.js',
    'src/memory/corpus.js',
    'src/memory/evaluate.js',
    'src/memory/pipeline.js',
  ]) {
    assert.equal(
      packedPaths.has(publicMemoryPath),
      true,
      `${publicMemoryPath} must be present in the npm package`,
    );
  }
  for (const repositoryOnlyPath of [
    'src/mine.js',
    'src/detectors.js',
    'src/extract.js',
    'src/similarity.js',
    'src/timeline.js',
    'src/catalog.js',
    'src/evidence.js',
    'src/memory/catalog.js',
    'src/memory/evidence.js',
  ]) {
    assert.equal(
      packedPaths.has(repositoryOnlyPath),
      false,
      `${repositoryOnlyPath} must remain outside the npm package`,
    );
  }
});
