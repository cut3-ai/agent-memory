import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeClassModule } from '../src/memory/class-index.js';

test('class index accepts one concrete static-ESM class', () => {
  const result = analyzeClassModule(`
    import { Unit } from '../core/Unit.js';
    export class Text extends Unit {
      static kind = 'unit.text';
      constructor() { super(); }
    }
  `, { module: './units/text.js', expectedPrefix: 'unit.' });
  assert.deepEqual(result.exports, [{ name: 'Text', kind: 'unit.text' }]);
  assert.deepEqual(result.violations, []);
});

test('class index rejects old factories, dynamic imports and renderer state', () => {
  const result = analyzeClassModule(`
    import React from 'react';
    import { Unit } from '../core/Unit.js';
    export const create = () => new Legacy();
    export class Legacy extends Unit {
      static kind = 'unit.legacy';
      constructor() { super(); this.backend = 'react'; }
      async load() { return import('./heavy.js'); }
      attach() {}
    }
  `, { module: './units/legacy.js', expectedPrefix: 'unit.' });
  assert.deepEqual(
    [...new Set(result.violations.map((entry) => entry.code))].sort(),
    [
      'attach-method',
      'dynamic-import',
      'factory-export',
      'forbidden-instance-field',
      'renderer-import-in-domain',
    ],
  );
});

test('kind must be an own literal on the concrete class', () => {
  const result = analyzeClassModule(`
    import { Unit } from '../core/Unit.js';
    const kind = 'unit.indirect';
    export class Indirect extends Unit { static kind = kind; }
  `, { module: './units/indirect.js', expectedPrefix: 'unit.' });
  assert.equal(result.exports.length, 0);
  assert.equal(result.violations[0].code, 'missing-literal-static-kind');
});
