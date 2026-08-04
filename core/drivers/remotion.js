import { createReactDriver } from './react.js';

/** Remotion is injected here; domain Units and Behaviours never import it. */
export function createRemotionDriver(React, remotion, renderUnit, options = {}) {
  requireComponent(remotion?.Sequence, 'Remotion Sequence');

  return createReactDriver(React, renderUnit, {
    ...options,
    name: 'remotion',
    components: {
      audio: remotion.Audio ?? 'audio',
      image: remotion.Img ?? 'img',
      layer: remotion.AbsoluteFill ?? 'div',
      surface: remotion.AbsoluteFill ?? 'div',
      video: remotion.OffthreadVideo ?? remotion.Video ?? 'video',
      ...(options.components ?? {}),
    },
    adaptProps(input) {
      const props = remotionProps(input);
      return typeof options.adaptProps === 'function'
        ? options.adaptProps(Object.freeze({ ...input, props }))
        : props;
    },
    renderSequence({ children, state }) {
      return React.createElement(remotion.Sequence, compact({
        durationInFrames: state.duration ?? undefined,
        from: state.from,
        name: state.name ?? undefined,
      }), ...children);
    },
  });
}

/** Hooks exist only in this top-level backend component. */
export function createRemotionComponent(React, remotion, renderUnit, compose, options = {}) {
  if (typeof compose !== 'function') throw new TypeError('compose must be a function');
  requireFunction(remotion?.useCurrentFrame, 'Remotion useCurrentFrame');
  requireFunction(remotion?.useVideoConfig, 'Remotion useVideoConfig');
  const driver = createRemotionDriver(React, remotion, renderUnit, options);

  return function CbaComposition(props) {
    const frame = remotion.useCurrentFrame();
    const video = remotion.useVideoConfig();
    const context = { ...(video ?? {}), frame };
    return driver.render(compose(props, context), context);
  };
}

function remotionProps({ name, props, state }) {
  if (name !== 'audio' && name !== 'video') return props;
  const {
    'data-end-frame': _end,
    'data-start-frame': _start,
    ...common
  } = props;
  return compact({
    ...common,
    endAt: state.to ?? undefined,
    startFrom: state.from === 0 ? undefined : state.from,
  });
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== undefined));
}

function requireFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} is required`);
}

function requireComponent(value, name) {
  if (!['function', 'object', 'string', 'symbol'].includes(typeof value) || value === null) {
    throw new TypeError(`${name} is required`);
  }
}
