import { Surface } from '../../../../units/surface.js';
import { visualStyle } from '../style.js';

export function renderSurface(context) {
  if (!(context.unit instanceof Surface)) return context.unhandled;
  return context.React.createElement(context.component('surface', 'div'), {
    style: visualStyle(context.state, {
      background: context.state.background,
      height: context.state.height,
      width: context.state.width,
    }),
  }, ...context.renderChildren());
}
