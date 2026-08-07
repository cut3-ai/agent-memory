import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import path from 'node:path';

import {
  loadMemoryFonts,
  memoryFontFaceCss,
  memoryFonts,
} from '@cut3/agent-memory/fonts/memory-fonts';

test('all exact style fonts are vendored and content-addressed', async () => {
  assert.deepEqual(memoryFonts.map((font) => font.family), [
    'Barlow Condensed',
    'IBM Plex Mono',
    'Silkscreen',
  ]);
  for (const font of memoryFonts) {
    const bytes = await readFile(fileURLToPath(font.file));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest, font.sha256, font.family);
  }
  const css = memoryFontFaceCss();
  assert.match(css, /font-display: block/u);
  assert.match(css, /Barlow Condensed/u);
  assert.match(css, /IBM Plex Mono/u);
  assert.match(css, /Silkscreen/u);
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

test('font preloader waits for every vendored face before rendering', async () => {
  const added = [];
  class FakeFontFace {
    constructor(family, source, descriptors) {
      Object.assign(this, { descriptors, family, source });
    }

    async load() {
      return this;
    }
  }
  const loaded = await loadMemoryFonts({
    FontFace: FakeFontFace,
    fontSet: {
      add(face) { added.push(face); },
      ready: Promise.resolve(),
    },
  });
  assert.equal(loaded.length, 3);
  assert.equal(added.length, 3);
  assert.deepEqual(added.map((font) => font.family), memoryFonts.map((font) => font.family));
});
