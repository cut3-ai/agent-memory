import { Group } from '../../../../units/group.js';
import { fragment, visualStyle } from '../style.js';

export function renderGroup(context) {
  if (!(context.unit instanceof Group)) return context.unhandled;
  const children = context.renderChildren();
  const style = visualStyle(context.state);
  return Object.keys(style).length > 0
    ? context.React.createElement('div', { style }, ...children)
    : fragment(context, children);
}
