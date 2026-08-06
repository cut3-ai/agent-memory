import { VectorPath } from '../../../../units/vector-path.js';
import { compact, visualStyle } from '../style.js';

/** Direct SVG adapter; the Remotion driver uses the same React boundary. */
export function renderVectorPath(context) {
  if (!(context.unit instanceof VectorPath)) return context.unhandled;
  return context.React.createElement(context.component('vectorPath', 'path'), compact({
    d: context.state.d,
    fill: context.state.fill,
    stroke: context.state.stroke,
    strokeDasharray: context.state.strokeDasharray.length > 0
      ? context.state.strokeDasharray.join(' ')
      : undefined,
    strokeLinecap: context.state.roundCaps ? 'round' : 'butt',
    strokeLinejoin: context.state.roundJoins ? 'round' : 'miter',
    strokeWidth: context.state.strokeWidth,
    style: visualStyle(context.state),
    vectorEffect: context.state.nonScalingStroke ? 'non-scaling-stroke' : undefined,
  }));
}
