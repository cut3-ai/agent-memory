import { Text } from '../../../../units/text.js';
import { visualStyle } from '../style.js';

export function renderText(context) {
  if (!(context.unit instanceof Text)) return context.unhandled;
  return context.React.createElement(
    context.component('text', 'span'),
    { style: visualStyle(context.state, context.state.typography) },
    context.state.text,
  );
}
