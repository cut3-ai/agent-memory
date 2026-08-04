import { ScatterText } from '../../../../units/scatter-text.js';
import { visualStyle } from '../style.js';

export function renderScatterText(context) {
  if (!(context.unit instanceof ScatterText)) return context.unhandled;
  return context.React.createElement(context.component('scatterText', 'div'), {
    style: visualStyle(context.state),
  }, ...context.renderChildren());
}
