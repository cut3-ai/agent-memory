import { projectFrame } from '@cut3/agent-memory/core/frame';
import { frameContext } from '@cut3/agent-memory/core/timeline';
import { memoryFontFaceCss } from '@cut3/agent-memory/fonts/memory-fonts';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { VectorPath, vectorPathData } from '@cut3/agent-memory/units/base/VectorPath';
import { Video } from '@cut3/agent-memory/units/base/Video';

export function createReactDriver(React, options = {}) {
  if (typeof React?.createElement !== 'function') throw new TypeError('React.createElement is required');

  const render = (root, input = {}) => {
    const context = frameContext({
      duration: root.duration ?? input.duration,
      fps: root.fps ?? input.fps,
      height: root.height ?? input.height,
      width: root.width ?? input.width,
      ...input,
    });
    const projection = projectFrame(root, context);
    return renderNode(root, projection);
  };

  function renderNode(unit, projection) {
    if (!projection.has(unit)) return null;
    const state = projection.stateOf(unit);
    const context = projection.contextOf(unit);
    const children = projection.childrenOf(unit)
      .map((child) => renderNode(child, projection))
      .filter(Boolean);

    if (unit instanceof Composition) {
      return React.createElement('div', {
        style: {
          background: state.background,
          height: `${state.height}px`,
          overflow: 'hidden',
          position: 'relative',
          width: `${state.width}px`,
        },
      }, React.createElement('style', {
        dangerouslySetInnerHTML: { __html: memoryFontFaceCss() },
      }), ...children);
    }
    if (unit instanceof Shot) {
      if (typeof options.renderShot === 'function') {
        return options.renderShot({ React, children, context, state, unit });
      }
      return fragment(React, children);
    }
    if (unit instanceof CompositionPivot) {
      return React.createElement('div', {
        style: {
          ...motionStyle(state),
          height: '100%',
          left: 0,
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          transformOrigin: `${state.pivot.x}px ${state.pivot.y}px`,
          width: '100%',
        },
      }, ...children);
    }
    if (unit instanceof Text) {
      return React.createElement('div', {
        style: {
          ...visualStyle(state),
          color: state.paint.color,
          fontFamily: state.typography.family,
          fontSize: `${state.typography.size}px`,
          fontStyle: state.typography.style,
          fontWeight: state.typography.weight,
          letterSpacing: `${state.typography.letterSpacing}px`,
          lineHeight: state.typography.lineHeight,
          textAlign: state.typography.align,
          textTransform: state.typography.transform,
          whiteSpace: 'pre-wrap',
        },
      }, state.text);
    }
    if (unit instanceof Image) {
      return React.createElement(options.imageComponent ?? 'img', {
        src: state.source,
        style: { ...visualStyle(state), objectFit: state.fit },
      });
    }
    if (unit instanceof Video) {
      const component = options.videoComponent ?? 'video';
      return React.createElement(component, {
        ...(options.videoComponent
          ? {
            ...(options.passVideoTimeline === false ? {} : {
              absoluteFrame: context.absoluteFrame,
              fps: context.fps,
              frame: context.frame,
            }),
            startFrom: state.startFrom,
          }
          : {
            'data-frame': context.frame,
            'data-start-frame': state.startFrom,
            playsInline: true,
            preload: 'auto',
            ref: synchronizeVideoAtFrame(state.startFrom + context.frame, context.fps),
          }),
        muted: state.muted,
        src: state.source,
        style: { ...visualStyle(state), objectFit: state.fit },
      });
    }
    if (unit instanceof VectorPath) {
      const [minX, minY, width, height] = state.viewBox;
      const drawStart = Math.max(0, Math.min(1, state.draw.start));
      const drawEnd = Math.max(drawStart, Math.min(1, state.draw.end));
      const drawn = drawEnd - drawStart;
      return React.createElement('svg', {
        style: visualStyle(state),
        viewBox: `${minX} ${minY} ${width} ${height}`,
      }, React.createElement('path', {
        d: vectorPathData(state.segments),
        fill: state.paint.fill,
        pathLength: 1,
        stroke: state.paint.stroke,
        strokeDasharray: `${drawn} ${Math.max(0, 1 - drawn)}`,
        strokeDashoffset: -drawStart,
        strokeLinecap: 'square',
        strokeLinejoin: 'miter',
        strokeWidth: state.paint.strokeWidth,
      }));
    }
    if (unit instanceof Box || unit instanceof Layer) {
      return React.createElement('div', { style: visualStyle(state) }, ...children);
    }

    // A memory Unit is a semantic, authored tree and needs no backend adapter.
    return fragment(React, children);
  }

  return Object.freeze({ name: options.name ?? 'react', render });
}

function synchronizeVideoAtFrame(frame, fps) {
  const time = frame / fps;
  return (element) => {
    if (!element) return;
    const seek = () => {
      element.pause();
      if (
        !Number.isFinite(element.currentTime)
        || Math.abs(element.currentTime - time) > 1 / (fps * 4)
      ) element.currentTime = time;
    };
    try {
      seek();
    } catch {
      element.addEventListener('loadedmetadata', seek, { once: true });
    }
  };
}

function visualStyle(state) {
  return {
    ...frameStyle(state.frame),
    ...motionStyle(state),
    background: state.paint?.fill === 'transparent' ? undefined : state.paint?.fill,
    border: state.paint?.strokeWidth > 0
      ? `${state.paint.strokeWidth}px solid ${state.paint.stroke}`
      : undefined,
    borderRadius: state.paint?.radius ? `${state.paint.radius}px` : undefined,
    boxSizing: 'border-box',
    overflow: state.overflow,
  };
}

function frameStyle(value = {}) {
  return {
    height: dimension(value.height),
    left: dimension(value.x),
    position: 'absolute',
    top: dimension(value.y),
    width: dimension(value.width),
    zIndex: value.z,
  };
}

function motionStyle(state) {
  const pose = state.pose ?? {};
  const effects = state.effects ?? {};
  return {
    filter: [
      effects.shadow && effects.shadow !== 'none' ? `drop-shadow(${effects.shadow})` : '',
      effects.blur ? `blur(${effects.blur}px)` : '',
      effects.brightness !== undefined ? `brightness(${effects.brightness})` : '',
      effects.contrast !== undefined ? `contrast(${effects.contrast})` : '',
      effects.saturate !== undefined ? `saturate(${effects.saturate})` : '',
    ].filter(Boolean).join(' ') || undefined,
    opacity: state.opacity,
    transform: [
      `translate3d(${pose.x ?? 0}px, ${pose.y ?? 0}px, 0)`,
      `rotate(${pose.rotate ?? 0}deg)`,
      `skewX(${pose.skewX ?? 0}deg)`,
      `scale(${pose.scaleX ?? 1}, ${pose.scaleY ?? 1})`,
    ].join(' '),
  };
}

function dimension(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

function fragment(React, children) {
  return React.createElement(React.Fragment ?? 'div', null, ...children);
}
