import { Video } from '../../../../units/video.js';
import { compact, visualStyle } from '../style.js';

export function renderVideo(context) {
  if (!(context.unit instanceof Video)) return context.unhandled;
  const props = compact({
    'data-end-frame': context.state.to ?? undefined,
    'data-start-frame': context.state.from === 0 ? undefined : context.state.from,
    muted: context.state.muted,
    playbackRate: context.state.rate,
    src: context.state.source,
    style: visualStyle(context.state),
    volume: context.state.volume,
  });
  return context.React.createElement(
    context.component('video', 'video'),
    context.props('video', props),
  );
}
