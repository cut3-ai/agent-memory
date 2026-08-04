import { TextNode } from '../../../../units/text-node.js';

export function renderTextNode(context) {
  if (!(context.unit instanceof TextNode)) return context.unhandled;
  return context.state.value;
}
