import assert from 'node:assert/strict';
import test from 'node:test';

import { CarbonCopyCadence } from '@cut3/agent-memory/behaviours/archival-dossier/CarbonCopyCadence';
import { PinnedEvidenceDrop } from '@cut3/agent-memory/behaviours/archival-dossier/PinnedEvidenceDrop';
import { EditorialImpactSettle } from '@cut3/agent-memory/behaviours/signal-editorial/EditorialImpactSettle';
import { RuneTrace } from '@cut3/agent-memory/behaviours/retro-ritual/RuneTrace';
import { PortalTileStutter } from '@cut3/agent-memory/behaviours/retro-ritual/PortalTileStutter';
import { projectUnit } from '@cut3/agent-memory/core/frame';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

test('EditorialImpactSettle is a complete authored treatment, not a property wrapper', () => {
  const pivot = new CompositionPivot(new Box(undefined), { x: 144, y: 1390 });
  pivot.add(new EditorialImpactSettle(pivot));
  const state = projectUnit(pivot, { frame: 8 });

  assert.notEqual(state.pose.x, 0);
  assert.notEqual(state.pose.y, 0);
  assert.notEqual(state.pose.rotate, 0);
  assert.notEqual(state.pose.scaleX, 1);
  assert.ok(state.effects.blur > 0);
  assert.match(state.effects.shadow, /#ff3b30/u);
});

test('PinnedEvidenceDrop preserves its paper weight and three-stage rotational settle', () => {
  const pivot = new CompositionPivot(new Box(undefined), { x: 196, y: 420 });
  pivot.add(new PinnedEvidenceDrop(pivot));
  const early = projectUnit(pivot, { frame: 5 });
  const recoil = projectUnit(pivot, { frame: 12 });
  const settled = projectUnit(pivot, { frame: 24 });

  assert.ok(early.pose.y < -100);
  assert.ok(recoil.pose.rotate > settled.pose.rotate);
  assert.equal(settled.pose.rotate, -0.25);
  assert.match(settled.effects.shadow, /rgba\(38,31,25/u);
});

test('CarbonCopyCadence retains runtime text outside memory and reveals it with fixed ink cadence', () => {
  const text = new Text('ONE TWO THREE FOUR FIVE');
  text.add(new CarbonCopyCadence(text));
  const early = projectUnit(text, { frame: 3 });
  const late = projectUnit(text, { frame: 30 });

  assert.equal(early.text, 'ONE TWO THREE');
  assert.equal(late.text, 'ONE TWO THREE FOUR FIVE');
  assert.equal(late.typography.family, 'IBM Plex Mono, monospace');
  assert.equal(late.paint.color, '#29231d');
  assert.match(late.effects.shadow, /116,71,48/u);
  assert.equal(text.text, 'ONE TWO THREE FOUR FIVE');
});

test('RuneTrace owns exact drawing colour, width, held cadence and geometry motion', () => {
  const rune = new VectorPath([
    { command: 'move', x: 0, y: 0 },
    { command: 'line', x: 80, y: 80 },
  ]);
  rune.add(new RuneTrace(rune));
  const state = projectUnit(rune, { frame: 10 });

  assert.equal(state.draw.end, 0.4);
  assert.equal(state.paint.stroke, '#78d64b');
  assert.ok([6, 8].includes(state.paint.strokeWidth));
  assert.equal(state.pose.rotate, -2);
  assert.notEqual(state.pose.scaleX, state.pose.scaleY);
});

test('PortalTileStutter resolves to a full tile and then uncovers the incoming scene', () => {
  const pivot = new CompositionPivot(new Box(undefined), { x: 540, y: 960 });
  pivot.add(new PortalTileStutter(pivot));
  const covered = projectUnit(pivot, { frame: 16 });
  const revealed = projectUnit(pivot, { frame: 28 });

  assert.equal(covered.pose.scaleX, 1);
  assert.equal(covered.pose.scaleY, 1);
  assert.equal(covered.opacity, 1);
  assert.equal(revealed.opacity, 0);
});
