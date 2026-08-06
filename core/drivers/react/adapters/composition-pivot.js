import { CompositionPivot } from '../../../../units/composition-pivot.js';
import { visualStyle } from '../style.js';

/**
 * Build a two-node pivot rig:
 *
 * composition origin -> outer node at (pivot.x, pivot.y)
 *                    -> inner node offset by (-pivot.x, -pivot.y)
 *
 * With no transform the offsets cancel. A transform on the outer node then
 * leaves the absolute composition pivot fixed while transforming its content.
 */
export function renderCompositionPivot(context) {
  if (!(context.unit instanceof CompositionPivot)) return context.unhandled;

  const { height, width } = context.frame;
  if (width <= 0 || height <= 0) {
    throw new RangeError(
      'CompositionPivot requires positive composition width and height in frame context',
    );
  }

  const { x, y } = context.state.pivot;
  const content = context.React.createElement('div', {
    style: {
      height,
      left: -x,
      position: 'absolute',
      top: -y,
      width,
    },
  }, ...context.renderChildren());

  return context.React.createElement(context.component('compositionPivot', 'div'), {
    style: {
      ...visualStyle(context.state),
      height,
      left: x,
      position: 'absolute',
      top: y,
      transformOrigin: '0px 0px',
      width,
    },
  }, content);
}
