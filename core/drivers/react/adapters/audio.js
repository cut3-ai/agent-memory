import { Audio } from '../../../../units/audio.js';
import { compact } from '../style.js';

export function renderAudio(context) {
  if (!(context.unit instanceof Audio)) return context.unhandled;
  const props = compact({
    'data-end-frame': context.state.to ?? undefined,
    'data-start-frame': context.state.from === 0 ? undefined : context.state.from,
    muted: context.state.muted ? true : undefined,
    playbackRate: context.state.rate === 1 ? undefined : context.state.rate,
    src: context.state.source,
    volume: context.state.volume === 1 ? undefined : context.state.volume,
  });
  return context.React.createElement(
    context.component('audio', 'audio'),
    context.props('audio', props),
  );
}
