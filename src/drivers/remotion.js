import { createReactDriver } from '@cut3/agent-memory/drivers/react';

export function createRemotionDriver(React, Remotion, options = {}) {
  if (!Remotion?.Sequence) throw new TypeError('Remotion.Sequence is required');
  return createReactDriver(React, {
    ...options,
    audioComponent: Remotion.Audio ?? options.audioComponent,
    compositionComponent: Remotion.AbsoluteFill ?? options.compositionComponent,
    imageComponent: Remotion.Img ?? options.imageComponent,
    motion: remotionMotion(Remotion) ?? options.motion,
    name: 'remotion',
    passVideoTimeline: false,
    renderShot({ children, phase, state }) {
      if (!['active', 'premount'].includes(phase)) {
        throw new TypeError('Remotion Shot must be active or premounted');
      }
      return React.createElement(Remotion.Sequence, {
        durationInFrames: state.duration,
        from: state.from,
        ...(state.reconciliationKey === null ? {} : { key: state.reconciliationKey }),
        name: state.name,
        premountFor: state.premountFor > 0 ? state.premountFor : undefined,
      }, ...children);
    },
    selectVideoComponent({ state }) {
      return remotionVideoComponent(Remotion, options, state);
    },
  });
}

function remotionMotion(Remotion) {
  if (Remotion.interpolate === undefined
    && Remotion.spring === undefined
    && Remotion.Easing === undefined) {
    return undefined;
  }
  return {
    Easing: Remotion.Easing,
    interpolate: Remotion.interpolate,
    spring: Remotion.spring,
  };
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

function remotionVideoComponent(Remotion, options, state) {
  const { backend, transparent } = state;
  if (transparent) {
    const component = Remotion.OffthreadVideo ?? options.offthreadVideoComponent;
    if (!component) {
      throw new TypeError('transparent video requires Remotion.OffthreadVideo');
    }
    return component;
  }
  if (backend === 'video') {
    const component = Remotion.Video ?? options.videoComponent;
    if (!component) throw new TypeError('Video backend requires Remotion.Video');
    return component;
  }
  if (backend === 'offthread-video') {
    const component = Remotion.OffthreadVideo ?? options.offthreadVideoComponent;
    if (!component) {
      throw new TypeError('offthread-video backend requires Remotion.OffthreadVideo');
    }
    return component;
  }
  const component = Remotion.OffthreadVideo ?? Remotion.Video ?? options.videoComponent;
  if (!component) throw new TypeError('Remotion video rendering requires a video component');
  return component;
}
