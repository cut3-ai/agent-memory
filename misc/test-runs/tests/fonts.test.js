import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Text } from '@cut3/agent-memory/units/base/Text';

const React = Object.freeze({
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
});

test('React driver preserves semantic font-family and never injects font resources', () => {
  const family = 'Runtime Font, system-ui';
  const composition = new Composition(new Text('caller copy', {
    typography: { family, size: 48 },
  }));
  const tree = createReactDriver(React).render(composition, { frame: 0 });
  const text = find(tree, (node) => node.props?.style?.fontFamily === family)[0];
  assert.ok(text);
  assert.equal(find(tree, (node) => node.type === 'style').length, 0);
});

test('driver source has no font loader, font CSS registry or FontFace side effect', async () => {
  const source = await readFile(
    new URL('../../../src/drivers/react.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /memory-fonts|memoryFontFaceCss|loadMemoryFonts|FontFace|dangerouslySetInnerHTML/u);
});

test('Agent Memory exports no font loader and excludes font bytes from its package', async () => {
  const packageDocument = JSON.parse(await readFile(
    new URL('../../../package.json', import.meta.url),
    'utf8',
  ));
  const npmIgnore = await readFile(
    new URL('../../../.npmignore', import.meta.url),
    'utf8',
  );
  assert.equal(Object.keys(packageDocument.exports).some((key) => key.startsWith('./fonts')), false);
  assert.deepEqual(packageDocument.files, ['src/**/*.js', 'VERIFY.md']);
  assert.match(npmIgnore, /^src\/assets\/fonts\/$/mu);
  assert.match(npmIgnore, /^src\/fonts\/$/mu);
});

test('browser showcase contains inspectable 1080x700 rendered contact sheets', async () => {
  for (const name of ['signal-editorial', 'archival-dossier', 'retro-ritual-ranking']) {
    const bytes = await readFile(path.resolve(`misc/test-runs/showcase/${name}.png`));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 1080);
    assert.equal(bytes.readUInt32BE(20), 700);
    assert.ok(bytes.length > 20_000);
  }
});

test('repository excludes font closures added by the audit', async () => {
  const names = new Set(await readdir(
    new URL('../../../src/assets/fonts/', import.meta.url),
  ));
  for (const name of [
    'Caveat-Bold.ttf',
    'Estonia-Regular.ttf',
    'Nunito-Latin-Variable.woff2',
    'Oswald-Latin-Variable.woff2',
  ]) assert.equal(names.has(name), false, name);
});

function find(node, predicate, output = []) {
  if (!node || typeof node !== 'object') return output;
  if (predicate(node)) output.push(node);
  for (const child of node.children ?? []) find(child, predicate, output);
  return output;
}
