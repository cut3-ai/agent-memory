import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

test('public memory entry exposes one online promotion authority', async () => {
  const [publicMemory, promotion, observer, retrieval] = await Promise.all([
    import('@cut3/agent-memory/memory'),
    import('../src/memory/promotion.js'),
    import('@cut3/agent-memory/memory/online-observer'),
    import('@cut3/agent-memory/memory/retrieval'),
  ]);

  assert.equal(publicMemory.orchestrateMemoryPromotion, promotion.orchestrateMemoryPromotion);
  assert.equal(publicMemory.OnlineMemoryObserver, observer.OnlineMemoryObserver);
  assert.equal(publicMemory.retrieveStyleMemories, retrieval.retrieveStyleMemories);
  for (const offlineName of [
    'buildCorpusCensus',
    'evaluateMemoryCandidate',
    'evaluateAndIssuePromotionGates',
    'runMemoryPipeline',
  ]) {
    assert.equal(Object.hasOwn(publicMemory, offlineName), false, offlineName);
  }

  const packageJson = JSON.parse(await fs.readFile(
    new URL('../package.json', import.meta.url),
    'utf8',
  ));
  assert.equal(packageJson.exports['./memory'], './src/memory/index.js');
  assert.equal(packageJson.exports['./memory/promotion'], './src/memory/promotion.js');
  assert.equal(packageJson.exports['./memory/retrieval'], './src/memory/retrieval.js');
  assert.equal(
    packageJson.exports['./memory/online-observer'],
    './src/feedback/online-observer.js',
  );
  for (const offlineSubpath of [
    './memory/corpus',
    './memory/pipeline',
    './memory/promotion-gates',
  ]) {
    assert.equal(Object.hasOwn(packageJson.exports, offlineSubpath), false, offlineSubpath);
  }
});

test('npm pack contains production code and excludes the complete lab topology', async () => {
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
  for (const productionPath of [
    'src/cba-v2/index.js',
    'src/feedback/classify.js',
    'src/feedback/online-observer.js',
    'src/feedback/outcome.js',
    'src/library/index.js',
    'src/memory/index.js',
    'src/memory/promotion.js',
    'src/memory/retrieval.js',
    'src/memory/style-contract.js',
    'src/providers/index.js',
  ]) {
    assert.equal(packedPaths.has(productionPath), true, productionPath);
  }

  const forbiddenPrefixes = [
    'lab/',
    'src/experiment/',
    'src/model-lab/',
    'memory-runs/',
    'experiment-runs/',
    'runs/',
  ];
  const forbiddenFiles = new Set([
    'src/cli.js',
    'src/detectors.js',
    'src/extract.js',
    'src/mine.js',
    'src/normalize.js',
    'src/report.js',
    'src/similarity.js',
    'src/timeline.js',
    'src/memory/class-index.js',
    'src/memory/cli.js',
    'src/memory/corpus.js',
    'src/memory/evaluate.js',
    'src/memory/pipeline.js',
    'src/memory/promotion-gates.js',
    'src/memory/promotion-gates-cli.js',
    'src/memory/reconstruction.js',
  ]);
  for (const packedPath of packedPaths) {
    assert.equal(
      forbiddenPrefixes.some((prefix) => packedPath.startsWith(prefix)),
      false,
      packedPath,
    );
    assert.equal(forbiddenFiles.has(packedPath), false, packedPath);
  }
});
