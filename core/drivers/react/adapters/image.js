import { Image } from '../../../../units/image.js';
import { compact, visualStyle } from '../style.js';

export function renderImage(context) {
  if (!(context.unit instanceof Image)) return context.unhandled;
  const props = compact({
    alt: context.state.alt ?? undefined,
    src: context.state.source,
    style: visualStyle(context.state, context.state.fit === null
      ? {}
      : { objectFit: context.state.fit }),
  });
  return context.React.createElement(
    context.component('image', 'img'),
    context.props('image', props),
  );
}
