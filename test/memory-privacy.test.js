import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertPublicArtifact,
  inspectPublicArtifact,
} from '../src/memory/privacy.js';

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
