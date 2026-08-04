import { SolidFill } from '../../../../units/solid-fill.js';
import { visualStyle } from '../style.js';

export function renderSolidFill(context) {
  if (!(context.unit instanceof SolidFill)) return context.unhandled;
  return context.React.createElement(context.component('solidFill', 'div'), {
    style: visualStyle(context.state),
  });
}
