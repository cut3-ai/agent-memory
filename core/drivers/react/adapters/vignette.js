import { Vignette } from '../../../../units/vignette.js';
import { visualStyle } from '../style.js';

export function renderVignette(context) {
  if (!(context.unit instanceof Vignette)) return context.unhandled;
  return context.React.createElement(context.component('vignette', 'div'), {
    style: visualStyle(context.state),
  });
}
