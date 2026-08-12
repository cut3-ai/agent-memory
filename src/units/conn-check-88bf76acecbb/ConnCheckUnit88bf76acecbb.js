import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

export const CONN_CHECK_MARKER_88BF76ACECBB = '88bf76acecbb';

/** Minimal connectivity-check marker unit; wraps a Text child in a plain labelled box. */
export class ConnCheckUnit88bf76acecbb extends Unit {
  static kind = 'unit.conn-check-88bf76acecbb.marker';

  constructor(content) {
    requireUnit(content, 'ConnCheckUnit88bf76acecbb content');
    requireDetachedUnit(content, 'ConnCheckUnit88bf76acecbb content');
    if (content.constructor.kind === 'unit.text') {
      content.frame = { x: 40, y: 40, width: 720, height: 160, z: 3 };
      content.paint = { ...content.paint, color: '#ffffff' };
      content.typography = {
        align: 'center',
        family: 'monospace',
        letterSpacing: 1,
        lineHeight: 1.2,
        size: 48,
        style: 'normal',
        transform: 'none',
        weight: 700,
      };
    }
    const plate = new Box(content, {
      frame: { x: 140, y: 860, width: 800, height: 240, z: 2 },
      overflow: 'hidden',
      paint: { fill: '#0a0a0a', stroke: '#88bf76', strokeWidth: 6, radius: 0 },
      name: 'conn-check-plate',
    });
    const stack = new Layer(plate, {
      frame: { x: 0, y: 0, width: 1080, height: 1920 },
      name: 'conn-check-stack',
    });
    const pivot = new CompositionPivot(stack, { x: 540, y: 980 });
    super(pivot);
  }
}
