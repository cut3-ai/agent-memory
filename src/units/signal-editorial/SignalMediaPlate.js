import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { EditorialImpactSettle } from '@cut3/agent-memory/behaviours/signal-editorial/EditorialImpactSettle';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { VectorPath } from '@cut3/agent-memory/units/base/VectorPath';

/** High-contrast cropped media plate with authored registration marks. */
export class SignalMediaPlate extends Unit {
  static kind = 'unit.signal-editorial.media-plate';

  constructor(content) {
    requireUnit(content, 'SignalMediaPlate content');
    requireDetachedUnit(content, 'SignalMediaPlate content');
    if ('frame' in content) content.frame = { x: 0, y: 0, width: '100%', height: '100%', z: 1 };

    const mediaWell = new Box(content, {
      effects: { contrast: 1.18, saturate: 0.78, shadow: '24px 26px 0 #111111' },
      frame: { x: 94, y: 250, width: 892, height: 830, z: 2 },
      overflow: 'hidden',
      paint: { fill: '#d8d0c2', stroke: '#111111', strokeWidth: 8 },
      name: 'signal-media-well',
    });
    const redBlock = new Box(undefined, {
      frame: { x: 58, y: 214, width: 304, height: 92, z: 1 },
      paint: { fill: '#ff3b30' },
      pose: { rotate: -3 },
      name: 'signal-red-tab',
    });
    const registration = new VectorPath([
      { command: 'move', x: 0, y: 32 },
      { command: 'line', x: 64, y: 32 },
      { command: 'move', x: 32, y: 0 },
      { command: 'line', x: 32, y: 64 },
      { command: 'move', x: 12, y: 12 },
      { command: 'line', x: 52, y: 52 },
    ], {
      frame: { x: 912, y: 1026, width: 64, height: 64, z: 5 },
      paint: { stroke: '#ff3b30', strokeWidth: 6 },
      viewBox: [0, 0, 64, 64],
    });
    const stack = new Layer(mediaWell, { name: 'signal-media-stack' });
    stack.add(redBlock, registration);
    const pivot = new CompositionPivot(stack, { x: 540, y: 665 });
    pivot.add(new EditorialImpactSettle(pivot));
    super(pivot);
  }
}
