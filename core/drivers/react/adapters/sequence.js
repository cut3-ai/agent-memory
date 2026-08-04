import { Sequence } from '../../../../units/sequence.js';
import { fragment } from '../style.js';

export function renderSequence(context) {
  if (!(context.unit instanceof Sequence)) return context.unhandled;
  const end = context.state.duration === null
    ? Number.POSITIVE_INFINITY
    : context.state.from + context.state.duration;
  if (context.frame.frame < context.state.from || context.frame.frame >= end) return null;

  const localFrame = { ...context.frame, frame: context.frame.frame - context.state.from };
  const children = context.renderChildren(localFrame);
  return context.renderSequence
    ? context.renderSequence(children)
    : fragment(context, children);
}
