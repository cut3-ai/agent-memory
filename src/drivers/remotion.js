import { createReactDriver } from '@cut3/agent-memory/drivers/react';

export function createRemotionDriver(React, Remotion, options = {}) {
  if (!Remotion?.Sequence) throw new TypeError('Remotion.Sequence is required');
  return createReactDriver(React, {
    ...options,
    imageComponent: Remotion.Img ?? options.imageComponent,
    name: 'remotion',
    passVideoTimeline: false,
    renderShot({ children, state }) {
      return React.createElement(Remotion.Sequence, {
        durationInFrames: state.duration,
        from: state.from,
        name: state.name,
      }, ...children);
    },
    videoComponent: Remotion.OffthreadVideo ?? Remotion.Video ?? options.videoComponent,
  });
}

export function createRemotionComponent(React, Remotion, compose, options = {}) {
  if (typeof compose !== 'function') throw new TypeError('compose must be a function');
  if (typeof Remotion?.useCurrentFrame !== 'function') throw new TypeError('useCurrentFrame is required');
  if (typeof Remotion?.useVideoConfig !== 'function') throw new TypeError('useVideoConfig is required');
  const driver = createRemotionDriver(React, Remotion, options);
  return function Cut3MemoryComposition(props) {
    const frame = Remotion.useCurrentFrame();
    const video = Remotion.useVideoConfig();
    return driver.render(compose(props), { ...video, frame });
  };
}
