import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve('.');

test('production source has global static ESM imports and no AST/promotion machinery', async () => {
  const files = await walk(path.join(root, 'src'));
  const javascript = files.filter((file) => file.endsWith('.js'));
  const sources = await Promise.all(javascript.map(async (file) => [file, await readFile(file, 'utf8')]));
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /from\s+['"]\.{1,2}\//u, `relative import in ${file}`);
    assert.doesNotMatch(source, /import\s*\(/u, `dynamic import in ${file}`);
    assert.doesNotMatch(source, /@babel|babel\/parser|promotion-ledger|parseModule|confidence/iu, `legacy mechanism in ${file}`);
  }
  assert.equal(files.some((file) => file.endsWith('.json')), false);
});

test('package has no runtime dependencies and exposes direct tree-shakeable subpaths', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(packageJson.dependencies, undefined);
  assert.deepEqual(packageJson.devDependencies, undefined);
  assert.equal(packageJson.sideEffects, false);
  assert.equal(packageJson.exports['./units/*'], './src/units/*.js');
  assert.equal(packageJson.exports['./behaviours/*'], './src/behaviours/*.js');
  assert.equal(packageJson.exports['./core/*'], './src/core/*.js');
  assert.equal(packageJson.exports['.'], undefined);
});

test('old generated index, promotion ledger and root test trees are gone', async () => {
  const rootNames = new Set(await readdir(root));
  for (const absent of ['behaviours', 'core', 'index.generated.json', 'lab', 'promotion-ledger.json', 'schemas', 'test', 'units']) {
    assert.equal(rootNames.has(absent), false, `${absent} must not exist at repository root`);
  }
  const miscNames = new Set(await readdir(path.join(root, 'misc', 'test-runs')));
  assert.equal(miscNames.has('tests'), true);
  assert.equal(miscNames.has('render-showcase.js'), true);
  assert.equal(miscNames.has('render-browser-showcase.js'), true);
  assert.equal(miscNames.has('showcase'), true);
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}
