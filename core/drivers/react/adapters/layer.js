import { Layer } from '../../../../units/layer.js';
import { visualStyle } from '../style.js';

export function renderLayer(context) {
  if (!(context.unit instanceof Layer)) return context.unhandled;
  return context.React.createElement(context.component('layer', 'div'), {
    style: visualStyle(context.state),
  }, ...context.renderChildren());
}
