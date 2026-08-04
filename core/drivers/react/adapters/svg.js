import { Svg } from '../../../../units/svg.js';
import { compact, visualStyle } from '../style.js';

export function renderSvg(context) {
  if (!(context.unit instanceof Svg)) return context.unhandled;
  return context.React.createElement(context.component('svg', 'svg'), compact({
    style: visualStyle(context.state),
    viewBox: context.state.viewBox ?? undefined,
  }), ...context.renderChildren());
}
