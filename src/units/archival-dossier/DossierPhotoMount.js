import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { PinnedEvidenceDrop } from '@cut3/agent-memory/behaviours/archival-dossier/PinnedEvidenceDrop';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** Warm evidence-board photo mount with torn tape, thread and registration ink. */
export class DossierPhotoMount extends Unit {
  static kind = 'unit.archival-dossier.photo-mount';

  constructor(content) {
    requireUnit(content, 'DossierPhotoMount content');
    requireDetachedUnit(content, 'DossierPhotoMount content');
    if ('frame' in content) content.frame = { x: 34, y: 36, width: 728, height: 690, z: 2 };
    const mount = new Box(content, {
      effects: { shadow: '18px 24px 0 rgba(42,32,24,.38)' },
      frame: { x: 138, y: 278, width: 796, height: 796, z: 3 },
      overflow: 'hidden',
      paint: { fill: '#e8dcc4', stroke: '#342a22', strokeWidth: 5 },
      pose: { rotate: -0.8 },
      name: 'dossier-paper-mount',
    });
    const tape = new VectorPath([
      { command: 'move', x: 2, y: 18 },
      { command: 'line', x: 34, y: 3 },
      { command: 'line', x: 72, y: 15 },
      { command: 'line', x: 112, y: 4 },
      { command: 'line', x: 154, y: 17 },
      { command: 'line', x: 190, y: 2 },
      { command: 'line', x: 218, y: 16 },
      { command: 'line', x: 206, y: 72 },
      { command: 'line', x: 8, y: 68 },
      { command: 'close' },
    ], {
      frame: { x: 432, y: 232, width: 220, height: 74, z: 8 },
      paint: { fill: '#d5c39d', stroke: '#9e8661', strokeWidth: 2 },
      pose: { rotate: 2.5 },
      viewBox: [0, 0, 220, 74],
    });
    const thread = new VectorPath([
      { command: 'move', x: 4, y: 4 },
      { command: 'cubic', x1: 142, y1: 72, x2: 290, y2: -42, x: 438, y: 46 },
      { command: 'cubic', x1: 520, y1: 94, x2: 616, y2: 18, x: 704, y: 92 },
    ], {
      frame: { x: 194, y: 1012, width: 704, height: 100, z: 9 },
      paint: { stroke: '#a33a2b', strokeWidth: 7 },
      viewBox: [0, 0, 708, 104],
    });
    const stack = new Layer(mount, { name: 'dossier-photo-stack' });
    stack.add(tape, thread);
    const pivot = new CompositionPivot(stack, { x: 196, y: 420 });
    pivot.add(new PinnedEvidenceDrop(pivot));
    super(pivot);
  }
}
