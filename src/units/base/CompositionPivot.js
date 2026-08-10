import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite } from '@cut3/agent-memory/core/timeline';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { effects, pose, presence } from '@cut3/agent-memory/units/base/visual';

/** Transform origin expressed in absolute composition coordinates. */
export class CompositionPivot extends Unit {
  static kind = 'unit.composition-pivot';

  constructor(unit, options = {}) {
    super(unit);
    this.pivot = {
      x: finite(options.x ?? 0, 'pivot.x'),
      y: finite(options.y ?? 0, 'pivot.y'),
    };
    this.pose = pose(options.pose);
    this.effects = effects(options.effects);
    this.name = String(options.name ?? 'composition-pivot');
    this.opacity = finite(options.opacity ?? 1, 'pivot.opacity');
    this.present = presence(options.present);
  }

  /**
   * Absolute pivots are only well-defined while every framed CSS containing
   * block keeps the composition coordinate space intact. Full-size nested
   * CompositionPivots deliberately compose explicit transforms; an implicit
   * shifted/clipped/transformed Layer or Box fails loudly.
   */
  validateProjection(context, ancestry) {
    let foundComposition = false;
    for (let index = ancestry.length - 1; index >= 0; index -= 1) {
      const { state, unit } = ancestry[index];
      if (unit instanceof Composition) {
        foundComposition = true;
        break;
      }
      if (!state.frame) continue;
      const { frame } = state;
      const fullWidth = frame.width === '100%' || frame.width === context.width;
      const fullHeight = frame.height === '100%' || frame.height === context.height;
      const unconstrainedFrame = (
        frame.right === undefined
        && frame.bottom === undefined
        && frame.minWidth === undefined
        && frame.maxWidth === undefined
        && frame.minHeight === undefined
        && frame.maxHeight === undefined
        && frame.aspectRatio === undefined
        && (frame.position ?? 'absolute') === 'absolute'
      );
      const borderless = !state.paint || (
        state.paint.strokeWidth === 0
        && (!state.paint.border || [
          state.paint.border.top,
          state.paint.border.right,
          state.paint.border.bottom,
          state.paint.border.left,
        ].every((side) => side.width === 0 || side.style === 'none'))
      );
      const untransformed = !state.pose || (
        state.pose.x === 0
        && state.pose.y === 0
        && state.pose.rotate === 0
        && state.pose.skewX === 0
        && state.pose.scaleX === 1
        && state.pose.scaleY === 1
        && (state.pose.operations?.length ?? 0) === 0
        && state.pose.perspective === undefined
        && (state.pose.transformStyle ?? 'flat') === 'flat'
      );
      const unpadded = !state.layout || Object.values(state.layout.padding).every(isZeroDimension);
      const unmanagedByLayout = !state.layoutItem;
      if (
        frame.x !== 0
        || frame.y !== 0
        || !fullWidth
        || !fullHeight
        || !unconstrainedFrame
        || !borderless
        || !untransformed
        || !unpadded
        || !unmanagedByLayout
      ) {
        throw new TypeError(
          'CompositionPivot must remain in an unshifted, untransformed, borderless, full-composition coordinate space',
        );
      }
    }
    if (!foundComposition) {
      throw new TypeError('CompositionPivot must belong to a Composition before rendering');
    }
  }
}

function isZeroDimension(value) {
  return value === 0 || (typeof value === 'string' && /^0(?:[a-z%]+)?$/iu.test(value));
}
