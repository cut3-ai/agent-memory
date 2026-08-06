import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const productionRoot = path.join(repositoryRoot, 'src');
const productionRoots = ['src', 'core', 'units', 'behaviours']
  .map((directory) => path.join(repositoryRoot, directory));

test('production source graph never imports the offline lab', async () => {
  const files = (await Promise.all(productionRoots.map(javascriptFiles))).flat();
  const violations = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\()(['"])(\.[^'"]+)\1/gu)) {
      const resolved = path.resolve(path.dirname(file), match[2]);
      const relative = path.relative(repositoryRoot, resolved);
      if (relative === 'lab' || relative.startsWith(`lab${path.sep}`)) {
        violations.push(`${path.relative(repositoryRoot, file)} -> ${relative}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('memory production surface contains one orchestration implementation', async () => {
  const memoryDirectory = path.join(productionRoot, 'memory');
  const memoryFiles = (await fs.readdir(memoryDirectory)).sort();
  assert.deepEqual(memoryFiles, [
    'agent-contract.js',
    'feedback.js',
    'gate-receipts.js',
    'index.js',
    'privacy',
    'privacy.js',
    'promotion',
    'promotion-cli.js',
    'promotion.js',
    'retrieval.js',
    'scent-schema.js',
    'style',
    'style-contract.js',
  ]);

  const files = await javascriptFiles(productionRoot);
  const definitions = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    if (/export\s+async\s+function\s+orchestrateMemoryPromotion\b/u.test(source)) {
      definitions.push(path.relative(repositoryRoot, file).replaceAll(path.sep, '/'));
    }
  }
  assert.deepEqual(definitions, ['src/memory/promotion.js']);
});

test('provider source graph has no local ESM import cycles', async () => {
  const files = await javascriptFiles(path.join(productionRoot, 'providers'));
  const known = new Set(files.map((file) => path.resolve(file)));
  const graph = new Map();
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const dependencies = [];
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)(['"])(\.[^'"]+)\1/gu)) {
      const unresolved = path.resolve(path.dirname(file), match[2]);
      const resolved = path.extname(unresolved) ? unresolved : `${unresolved}.js`;
      if (known.has(resolved)) dependencies.push(resolved);
    }
    graph.set(path.resolve(file), [...new Set(dependencies)]);
  }

  const active = new Set();
  const complete = new Set();
  const cycles = [];
  const visit = (file, stack) => {
    if (active.has(file)) {
      const start = stack.indexOf(file);
      cycles.push([...stack.slice(start), file]
        .map((entry) => path.relative(repositoryRoot, entry).replaceAll(path.sep, '/'))
        .join(' -> '));
      return;
    }
    if (complete.has(file)) return;
    active.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...stack, file]);
    active.delete(file);
    complete.add(file);
  };
  for (const file of graph.keys()) visit(file, []);
  assert.deepEqual([...new Set(cycles)].sort(), []);
});

async function javascriptFiles(directory) {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await javascriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(target);
  }
  return output.sort((left, right) => left.localeCompare(right));
}
