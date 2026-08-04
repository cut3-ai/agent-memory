import { Video } from '../../../../units/video.js';
import { compact, visualStyle } from '../style.js';

export function renderVideo(context) {
  if (!(context.unit instanceof Video)) return context.unhandled;
  const props = compact({
    'data-end-frame': context.state.to ?? undefined,
    'data-start-frame': context.state.from === 0 ? undefined : context.state.from,
    muted: context.state.muted ? true : undefined,
    playbackRate: context.state.rate === 1 ? undefined : context.state.rate,
    src: context.state.source,
    style: visualStyle(context.state),
    transparent: context.state.transparent ? true : undefined,
    volume: context.state.volume === 1 ? undefined : context.state.volume,
  });
  return context.React.createElement(
    context.component('video', 'video'),
    context.props('video', props),
  );
}
