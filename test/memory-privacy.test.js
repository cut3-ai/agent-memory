import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPublicArtifact,
  assertPublicModuleSources,
  inspectPublicArtifact,
  inspectPublicModuleSources,
} from '../src/memory/privacy.js';
import {
  PUBLIC_FONT_FAMILIES,
  PUBLIC_FONT_FAMILY_CATALOG_VERSION,
} from '../src/memory/privacy/font-family-catalog.js';

test('public font-family catalog is closed, versioned, and bounded', () => {
  assert.equal(PUBLIC_FONT_FAMILY_CATALOG_VERSION, 'public-font-family-catalog-v1');
  assert.equal(Object.isFrozen(PUBLIC_FONT_FAMILIES), true);
  assert.ok(PUBLIC_FONT_FAMILIES.length > 10 && PUBLIC_FONT_FAMILIES.length <= 64);
  assert.equal(new Set(PUBLIC_FONT_FAMILIES.map((family) => family.toLowerCase())).size,
    PUBLIC_FONT_FAMILIES.length);
  for (const required of ['Anton', 'Barlow Condensed', 'Inter', 'monospace', 'sans-serif', 'serif']) {
    assert.ok(PUBLIC_FONT_FAMILIES.includes(required), required);
  }
});

test('public artifact validation rejects raw user payloads', () => {
  const value = {
    safeHash: 'a'.repeat(64),
    nested: {
      prompt: 'private',
      detail: 'https://private.invalid/media.mp4',
    },
  };
  assert.deepEqual(inspectPublicArtifact(value).map((entry) => entry.code).sort(), [
    'forbidden-key',
    'raw-url',
  ]);
  assert.throws(() => assertPublicArtifact(value), /privacy validation/);
});

test('public artifact validation rejects traversal in module sources', () => {
  const value = {
    source: 'units/../private.js',
  };
  assert.deepEqual(inspectPublicArtifact(value), [{
    path: 'source',
    code: 'raw-source',
  }]);
});

test('public artifact validation rejects one-word raw payload fields fail-closed', () => {
  const findings = inspectPublicArtifact({
    caption: 'approved',
    userContent: 'private',
    dialogue: 'hello',
    source_code: 'identifier',
    source: 'privateIdentifier',
    PROMPT: 'rewrite',
    transcript: 'secret',
  });
  const codesByPath = Object.fromEntries(findings.map(({ path, code }) => [path, code]));

  assert.deepEqual(codesByPath, {
    caption: 'forbidden-key',
    userContent: 'forbidden-key',
    dialogue: 'forbidden-key',
    source_code: 'forbidden-key',
    source: 'raw-source',
    PROMPT: 'forbidden-key',
    transcript: 'forbidden-key',
  });
});

test('public artifact validation rejects email addresses and non-http URIs', () => {
  assert.deepEqual(inspectPublicArtifact({ contact: 'owner@private.invalid' }), [{
    path: 'contact',
    code: 'raw-email',
  }]);
  assert.deepEqual(inspectPublicArtifact({ asset: 'ftp://private.invalid/archive' }), [{
    path: 'asset',
    code: 'raw-uri',
  }]);
  assert.deepEqual(inspectPublicArtifact({ locator: 'data:text/plain,private' }), [{
    path: 'locator',
    code: 'raw-uri',
  }]);
});

test('public artifact validation rejects bare hosts and IP addresses', () => {
  for (const value of [
    'private.example',
    '127.0.0.1:4312',
    '[2001:db8::1]:4312',
    '::1',
    'localhost:4312',
  ]) {
    assert.ok(
      inspectPublicArtifact({ locator: value }).some(({ code }) => code === 'raw-host'),
      value,
    );
  }
});

test('public artifact validation allows bounded schema metadata and real module sources', () => {
  const artifact = {
    schemaVersion: 2,
    format: 'cut3-memory-evidence',
    candidateSha256: 'a'.repeat(64),
    counts: { compositions: 12, matchedFrames: 400 },
    candidateKind: 'unit.box',
    channel: 'transform.scale',
    infrastructureKind: 'behaviour.opacity',
    candidate: { kind: 'unit.text-card' },
    capability: 'visual.container',
    sourceKind: 'jsx.container',
    stratification: { labels: [{ label: 'render:dom' }] },
    artifacts: [{ file: 'rounds/round-01.json', bytes: 120 }],
    source: 'units/text/card.js',
    dependency: { source: './behaviours/opacity.mjs' },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { signal: { enum: ['positive', 'neutral'] } },
      required: ['signal'],
    },
  };

  assert.deepEqual(inspectPublicArtifact(artifact), []);
  assert.equal(assertPublicArtifact(artifact), artifact);
});

test('built-in module privacy scans executable bytes and staged semantic literals', () => {
  const safe = [
    "import { Unit } from '../core/Unit.js';",
    'export class Card extends Unit {',
    "  static kind = 'unit.card';",
    "  static scent = Object.freeze({ family: 'editorial', composition: ['stack'], typography: ['condensed'], palette: ['ink'], rendering: ['grain'], motion: ['snap'] });",
    '  constructor(content) {',
    "    const style = { fontFamily: 'Barlow Condensed', backgroundImage: 'radial-gradient(#fff 0.7px, transparent 0.7px)', color: '#f5f1e8', border: '4px solid #fff' };",
    '    super(content);',
    '  }',
    '}',
    '',
  ].join('\n');
  const records = [{ file: 'units/card.js', source: safe }];
  assert.deepEqual(inspectPublicModuleSources(records, { strictFiles: ['units/card.js'] }), []);
  assert.equal(assertPublicModuleSources(records, { strictFiles: ['units/card.js'] }), records);

  const anton = safe.replace("fontFamily: 'Barlow Condensed'", "fontFamily: 'Anton'");
  assert.deepEqual(inspectPublicModuleSources(
    [{ file: 'units/card.js', source: anton }],
    { strictFiles: ['units/card.js'] },
  ), []);

  const transcript = safe.replace(
    'const style =',
    "const privateTranscript = 'speaker disclosed private launch details';\n    const style =",
  );
  assert.ok(inspectPublicModuleSources(
    [{ file: 'units/card.js', source: transcript }],
    { strictFiles: ['units/card.js'] },
  ).some(({ code }) => code === 'embedded-semantic-content'));

  for (const declaration of [
    "const leaked = 'Alice';",
    'const leaked = `Alice`;',
    'const leaked = `${content}`;',
    "'private transcript words from user';",
    'const leaked = /private transcript words from user/;',
  ]) {
    const oneWordLeak = safe.replace('const style =', `${declaration}\n    const style =`);
    assert.ok(inspectPublicModuleSources(
      [{ file: 'units/card.js', source: oneWordLeak }],
      { strictFiles: ['units/card.js'] },
    ).some(({ code }) => code === 'embedded-semantic-content'), declaration);
  }

  for (const declaration of [
    "const leaked = {'private transcript words from user': 1};",
    "const leaked = {['private transcript words from user']: 1};",
  ]) {
    const propertyKeyLeak = safe.replace('const style =', `${declaration}\n    const style =`);
    assert.ok(inspectPublicModuleSources(
      [{ file: 'units/card.js', source: propertyKeyLeak }],
      { strictFiles: ['units/card.js'] },
    ).some(({ code }) => code === 'embedded-semantic-content'), declaration);
  }

  const identifierKeys = safe.replace(
    'const style =',
    'const metadata = { authoredGeometry: 1 };\n    const style =',
  );
  assert.deepEqual(inspectPublicModuleSources(
    [{ file: 'units/card.js', source: identifierKeys }],
    { strictFiles: ['units/card.js'] },
  ), []);

  const commentLeak = safe.replace('const style =', '// Alice\n    const style =');
  assert.ok(inspectPublicModuleSources(
    [{ file: 'units/card.js', source: commentLeak }],
    { strictFiles: ['units/card.js'] },
  ).some(({ code }) => code === 'embedded-comment-content'));

  for (const [property, unsafeValue] of [
    ['fontFamily', 'private transcript words'],
    ['fontFamily', 'UnlistedDisplay'],
    ['backgroundImage', 'private transcript words'],
    ['color', 'private transcript words'],
    ['border', '4px solid private transcript'],
  ]) {
    const styleLeak = safe.replace(
      "fontFamily: 'Barlow Condensed'",
      `${property}: '${unsafeValue}'`,
    );
    assert.ok(inspectPublicModuleSources(
      [{ file: 'units/card.js', source: styleLeak }],
      { strictFiles: ['units/card.js'] },
    ).some(({ code }) => code === 'unsafe-style-literal'), `${property}: ${unsafeValue}`);
  }

  const secretDependency = `${safe}// sk-privatefixturetoken1234567890\n`;
  assert.ok(inspectPublicModuleSources([
    { file: 'units/card.js', source: secretDependency },
  ]).some(({ code }) => code === 'secret-like-token-source-bytes'));
});
