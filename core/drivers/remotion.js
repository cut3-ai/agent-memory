import { createReactDriver } from './react.js';

/**
 * Remotion uses React's renderer, but gets a named driver so callers can make
 * the frame-pure execution contract explicit and swap a browser fallback in.
 */
export function createRemotionDriver(React, hooks = {}) {
  const driver = createReactDriver(React, {
    getFrameContext: () => {
      const video = typeof hooks.useVideoConfig === 'function'
        ? hooks.useVideoConfig()
        : {};
      return {
        ...video,
        frame: typeof hooks.useCurrentFrame === 'function'
          ? hooks.useCurrentFrame()
          : undefined,
      };
    },
  });
  return { ...driver, name: 'remotion' };
}
