import { Box } from '../../../../units/box.js';
import { visualStyle } from '../style.js';

export function renderBox(context) {
  if (!(context.unit instanceof Box)) return context.unhandled;
  return context.React.createElement(context.component('box', 'div'), {
    style: visualStyle(context.state),
  }, ...context.renderChildren());
}
