import { projectFrame } from '@cut3/agent-memory/core/frame';
import { frameContext } from '@cut3/agent-memory/core/timeline';
import { Audio } from '@cut3/agent-memory/units/base/Audio';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { VectorPath, vectorPathData } from '@cut3/agent-memory/units/base/VectorPath';
import { Video } from '@cut3/agent-memory/units/base/Video';

export function createReactDriver(React, options = {}) {
  if (typeof React?.createElement !== 'function') throw new TypeError('React.createElement is required');
  if (options.selectVideoComponent !== undefined
    && typeof options.selectVideoComponent !== 'function') {
    throw new TypeError('options.selectVideoComponent must be a function');
  }
  const unitRenderers = rendererRegistry(options.unitRenderers);

  const render = (root, input = {}) => {
    const context = frameContext({
      duration: root.duration ?? input.duration,
      fps: root.fps ?? input.fps,
      height: root.height ?? input.height,
      width: root.width ?? input.width,
      ...input,
      motion: input.motion ?? options.motion,
    });
    const projection = projectFrame(root, context);
    return renderNode(root, projection);
  };

  function renderNode(
    unit,
    projection,
    mediaDefaults = null,
  ) {
    if (!projection.has(unit)) return null;
    const state = projection.stateOf(unit);
    const context = projection.contextOf(unit);
    if (state.present === false) return null;
    const shotPhase = unit instanceof Shot ? unit.mountPhase(context) : null;
    if (shotPhase === 'premount' && typeof options.renderShot !== 'function') return null;
    const projectedChildren = projection.childrenOf(unit);
    requireDistinctShotKeys(projectedChildren);
    const nativeRenderer = unitRenderers[unit.constructor.kind];
    const renderChildren = memoizeChildren(() => {
      const childMediaDefaults = unit instanceof Shot
        ? shotMediaDefaults(state, mediaDefaults)
        : mediaDefaults;
      return projectedChildren
        .map((child) => renderNode(
          child,
          projection,
          childMediaDefaults,
        ))
        .filter(Boolean);
    });

    if (nativeRenderer) {
      return nativeRenderer(nativeRendererInput({
        React,
        context,
        projectedChildren: projectedChildren
          .filter((child) => projection.has(child))
          .map((child) => Object.freeze({
            context: projection.contextOf(child),
            state: projection.stateOf(child),
            unit: child,
          })),
        renderChildren,
        state,
        unit,
      }));
    }
    const children = renderChildren();

    if (unit instanceof Composition) {
      if (options.compositionComponent) {
        return React.createElement(options.compositionComponent, {
          style: { backgroundColor: state.background },
        }, ...children);
      }
      return React.createElement('div', {
        style: {
          background: state.background,
          height: `${state.height}px`,
          overflow: 'hidden',
          position: 'relative',
          width: `${state.width}px`,
        },
      }, ...children);
    }
    if (unit instanceof Shot) {
      if (typeof options.renderShot === 'function') {
        return options.renderShot({ React, children, context, phase: shotPhase, state, unit });
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
      const wrap = state.typography.wrap ?? {};
      const maxLines = wrap.maxLines;
      const gradientFill = state.typography.fill;
      return React.createElement(state.inline ? 'span' : 'div', {
        style: {
          ...visualStyle(state),
          color: gradientFill ? 'transparent' : state.paint.color,
          fontFamily: state.typography.family,
          fontSize: `${state.typography.size}px`,
          fontStyle: state.typography.style,
          fontWeight: state.typography.weight,
          letterSpacing: `${state.typography.letterSpacing}px`,
          lineHeight: state.typography.lineHeight,
          paintOrder: state.typography.paintOrder?.length > 0
            ? state.typography.paintOrder.join(' ')
            : undefined,
          textAlign: state.typography.align,
          textOverflow: wrap.textOverflow ?? 'clip',
          textShadow: shadowsStyle(state.typography.shadows),
          textTransform: state.typography.transform,
          ...(gradientFill ? {
            background: backgroundStyle(gradientFill),
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          } : {}),
          WebkitBoxOrient: maxLines ? 'vertical' : undefined,
          WebkitLineClamp: maxLines ?? undefined,
          WebkitTextStroke: state.typography.stroke?.width > 0
            ? `${state.typography.stroke.width}px ${state.typography.stroke.color}`
            : undefined,
          whiteSpace: wrap.whiteSpace ?? 'pre-wrap',
          wordBreak: wrap.wordBreak ?? 'normal',
          overflowWrap: wrap.overflowWrap ?? 'normal',
          ...(maxLines ? { display: '-webkit-box', overflow: 'hidden' } : {}),
          ...(state.inline ? inlineTextStyle(state.inline) : {}),
        },
      }, state.text, ...children);
    }
    if (unit instanceof Image) {
      return React.createElement(options.imageComponent ?? 'img', {
        decoding: state.decode === 'auto' ? undefined : state.decode,
        src: state.source,
        style: {
          ...visualStyle(state),
          objectFit: state.fit,
          objectPosition: defaultMediaPosition(state.position)
            ? undefined
            : mediaPositionStyle(state.position),
        },
      });
    }
    if (unit instanceof Video) {
      const videoState = resolvedVideoState(state, mediaDefaults);
      const selected = options.selectVideoComponent?.({
        context,
        state: videoState,
        unit,
      });
      if (options.selectVideoComponent && !selected) {
        throw new TypeError('options.selectVideoComponent must return a video component');
      }
      if (videoState.transparent && !selected) {
        throw new TypeError('transparent video requires an explicitly selected video component');
      }
      const component = selected ?? options.videoComponent ?? 'video';
      const injected = Boolean(selected ?? options.videoComponent);
      return React.createElement(component, {
        ...(injected
          ? {
            ...(options.passVideoTimeline === false ? {} : {
              absoluteFrame: context.absoluteFrame,
              fps: context.fps,
              frame: context.frame,
            }),
            endAt: state.endAt ?? undefined,
            loop: state.loop,
            pauseWhenBuffering: videoState.pauseWhenBuffering,
            playbackRate: state.playbackRate,
            startFrom: state.startFrom,
            ...(videoState.transparent ? { transparent: true } : {}),
            volume: state.volume,
          }
          : {
            loop: state.loop,
            playsInline: true,
          }),
        muted: state.muted,
        src: state.source,
        style: {
          ...visualStyle(state),
          objectFit: state.fit,
          objectPosition: mediaPositionStyle(state.position),
        },
      });
    }
    if (unit instanceof Audio) {
      const component = options.audioComponent ?? 'audio';
      return React.createElement(component, {
        ...(options.audioComponent
          ? {
            endAt: state.endAt ?? undefined,
            loop: state.loop,
            playbackRate: state.playbackRate,
            startFrom: state.startFrom,
            volume: state.volume,
          }
          : {
            loop: state.loop,
          }),
        muted: state.muted,
        src: state.source,
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
    if (unit instanceof Layout) {
      return React.createElement('div', {
        style: { ...visualStyle(state), ...layoutStyle(state.layout) },
      }, ...children);
    }
    if (unit instanceof Box || unit instanceof Layer) {
      return React.createElement('div', { style: visualStyle(state) }, ...children);
    }

    // A memory Unit is a semantic, authored tree and needs no backend adapter.
    return fragment(React, children);
  }

  return Object.freeze({ name: options.name ?? 'react', render });
}

function rendererRegistry(value) {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('options.unitRenderers must be an object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('options.unitRenderers must be a plain object');
  }
  const entries = Object.entries(value).map(([kind, renderer]) => {
    if (!/^(?:unit|composition)\.[a-z0-9][a-z0-9.-]*$/u.test(kind)) {
      throw new TypeError(`Invalid native Unit renderer kind: ${kind}`);
    }
    if (typeof renderer !== 'function') {
      throw new TypeError(`Native Unit renderer ${kind} must be a function`);
    }
    return [kind, renderer];
  });
  return Object.freeze(Object.fromEntries(entries));
}

function memoizeChildren(render) {
  let children;
  return () => {
    if (children === undefined) children = render();
    return children;
  };
}

function nativeRendererInput({
  React,
  context,
  projectedChildren,
  renderChildren,
  state,
  unit,
}) {
  const input = {
    React,
    context,
    projectedChildren: Object.freeze(projectedChildren),
    renderChildren,
    state,
    unit,
  };
  Object.defineProperty(input, 'children', {
    enumerable: true,
    get: renderChildren,
  });
  return Object.freeze(input);
}

function mediaPositionStyle(value = {}) {
  return `${(value.x ?? 0.5) * 100}% ${(value.y ?? 0.5) * 100}%`;
}

function defaultMediaPosition(value = {}) {
  return (value.x ?? 0.5) === 0.5 && (value.y ?? 0.5) === 0.5;
}

function visualStyle(state) {
  return {
    ...frameStyle(state.frame),
    ...motionStyle(state),
    ...paintStyle(state.paint),
    ...layoutItemStyle(state.layoutItem),
    boxSizing: state.frame?.boxSizing ?? 'border-box',
    overflow: state.overflow === 'visible' ? undefined : state.overflow,
  };
}

function frameStyle(value = {}) {
  const positioned = (value.position ?? 'absolute') !== 'static';
  return {
    aspectRatio: value.aspectRatio,
    bottom: positioned ? dimension(value.bottom) : undefined,
    height: dimension(value.height),
    left: positioned ? dimension(value.x) : undefined,
    maxHeight: dimension(value.maxHeight),
    maxWidth: dimension(value.maxWidth),
    minHeight: dimension(value.minHeight),
    minWidth: dimension(value.minWidth),
    position: (value.position ?? 'absolute') === 'static'
      ? undefined
      : value.position ?? 'absolute',
    right: positioned ? dimension(value.right) : undefined,
    top: positioned ? dimension(value.y) : undefined,
    width: dimension(value.width),
    zIndex: value.z === 'auto' ? undefined : value.z,
  };
}

function motionStyle(state) {
  const pose = state.pose ?? {};
  const effects = state.effects ?? {};
  const typedFilters = (effects.filters ?? []).map(filterStyle);
  const backdropFilters = (effects.backdropFilters ?? []).map(filterStyle);
  const operations = (pose.operations ?? []).map(transformOperationStyle);
  return {
    filter: [
      effects.shadow && effects.shadow !== 'none' ? `drop-shadow(${effects.shadow})` : '',
      effects.blur ? `blur(${effects.blur}px)` : '',
      effects.brightness !== undefined && effects.brightness !== 1
        ? `brightness(${effects.brightness})`
        : '',
      effects.contrast !== undefined && effects.contrast !== 1
        ? `contrast(${effects.contrast})`
        : '',
      effects.saturate !== undefined && effects.saturate !== 1
        ? `saturate(${effects.saturate})`
        : '',
      ...typedFilters,
    ].filter(Boolean).join(' ') || undefined,
    backdropFilter: backdropFilters.join(' ') || undefined,
    backfaceVisibility: pose.backfaceVisibility === 'visible'
      ? undefined
      : pose.backfaceVisibility,
    boxShadow: shadowsStyle(effects.boxShadows, true),
    isolation: effects.isolation === 'auto' ? undefined : effects.isolation,
    mixBlendMode: effects.blendMode === 'normal' ? undefined : effects.blendMode,
    opacity: state.opacity === 1 ? undefined : state.opacity,
    perspective: pose.perspective === undefined ? undefined : `${pose.perspective}px`,
    perspectiveOrigin: pose.perspectiveOrigin
      ? `${dimension(pose.perspectiveOrigin.x)} ${dimension(pose.perspectiveOrigin.y)}`
      : undefined,
    transform: [
      pose.x || pose.y ? `translate3d(${pose.x ?? 0}px, ${pose.y ?? 0}px, 0)` : '',
      pose.rotate ? `rotate(${pose.rotate}deg)` : '',
      pose.skewX ? `skewX(${pose.skewX}deg)` : '',
      pose.scaleX !== undefined && pose.scaleY !== undefined
        && (pose.scaleX !== 1 || pose.scaleY !== 1)
        ? `scale(${pose.scaleX}, ${pose.scaleY})`
        : '',
      ...operations,
    ].filter(Boolean).join(' ') || undefined,
    transformOrigin: pose.origin
      ? `${dimension(pose.origin.x)} ${dimension(pose.origin.y)} ${pose.origin.z}px`
      : undefined,
    transformStyle: pose.transformStyle === 'flat' ? undefined : pose.transformStyle,
  };
}

function paintStyle(value = {}) {
  const layers = (value.backgrounds ?? []).map(backgroundStyle);
  const border = value.border;
  const tiled = (value.backgrounds ?? []).some((layer) => layer.tile != null);
  const layerPlacement = tiled ? {
    backgroundPosition: value.backgrounds.map(backgroundPositionStyle).join(', '),
    backgroundRepeat: value.backgrounds.map(backgroundRepeatStyle).join(', '),
    backgroundSize: value.backgrounds.map(backgroundSizeStyle).join(', '),
  } : {};
  const outline = outlineStyle(value.outline);
  if (!border) {
    return {
      background: layers.length > 0
        ? layers.join(', ')
        : value.fill === 'transparent' ? undefined : value.fill,
      backgroundBlendMode: backgroundBlendStyle(value.backgrounds),
      ...layerPlacement,
      border: value.strokeWidth > 0
        ? `${value.strokeWidth}px solid ${value.stroke}`
        : undefined,
      borderRadius: value.radius ? `${value.radius}px` : undefined,
      ...outline,
    };
  }
  return {
    background: layers.length > 0
      ? layers.join(', ')
      : value.fill === 'transparent' ? undefined : value.fill,
    backgroundBlendMode: backgroundBlendStyle(value.backgrounds),
    ...layerPlacement,
    borderTop: borderSideStyle(border.top),
    borderRight: borderSideStyle(border.right),
    borderBottom: borderSideStyle(border.bottom),
    borderLeft: borderSideStyle(border.left),
    borderRadius: [
      border.radii.topLeft,
      border.radii.topRight,
      border.radii.bottomRight,
      border.radii.bottomLeft,
    ].map((radius) => `${radius}px`).join(' '),
    ...outline,
  };
}

function backgroundStyle(value) {
  if (value.kind === 'solid') return `linear-gradient(${value.color}, ${value.color})`;
  if (value.kind === 'linear-gradient') {
    const kind = value.repeating ? 'repeating-linear-gradient' : 'linear-gradient';
    return `${kind}(${value.angle}deg, ${gradientStopsStyle(value.stops)})`;
  }
  if (value.kind === 'radial-gradient') {
    const kind = value.repeating ? 'repeating-radial-gradient' : 'radial-gradient';
    return `${kind}(${value.shape} at ${pointStyle(value.position)}, ${gradientStopsStyle(value.stops)})`;
  }
  if (value.kind === 'conic-gradient') {
    return `conic-gradient(from ${value.angle}deg at ${pointStyle(value.position)}, ${gradientStopsStyle(value.stops)})`;
  }
  const size = value.fit === 'stretch' ? '100% 100%' : value.fit;
  return `url("${cssString(value.source)}") ${pointStyle(value.position)} / ${size} ${value.repeat}`;
}

function backgroundBlendStyle(values = []) {
  return values.some((value) => value.blendMode !== 'normal')
    ? values.map((value) => value.blendMode).join(', ')
    : undefined;
}

function gradientStopsStyle(stops) {
  return stops.map((stop) => (
    `${stop.color} ${stop.unit === 'px' ? `${stop.offset}px` : `${stop.offset * 100}%`}`
  )).join(', ');
}

function backgroundPositionStyle(value) {
  if (value.tile) return pointStyle(value.tile.position);
  if (value.kind === 'image') return pointStyle(value.position);
  return '0px 0px';
}

function backgroundRepeatStyle(value) {
  if (value.tile) return value.tile.repeat;
  if (value.kind === 'image') return value.repeat;
  return 'repeat';
}

function backgroundSizeStyle(value) {
  if (value.tile) return `${dimension(value.tile.size.width)} ${dimension(value.tile.size.height)}`;
  if (value.kind === 'image') return value.fit === 'stretch' ? '100% 100%' : value.fit;
  return 'auto';
}

function outlineStyle(value) {
  if (!value || value.width === 0 || value.style === 'none') {
    return { outline: undefined, outlineOffset: undefined };
  }
  return {
    outline: `${value.width}px ${value.style} ${value.color}`,
    outlineOffset: `${value.offset}px`,
  };
}

function borderSideStyle(side) {
  return side.width > 0 && side.style !== 'none'
    ? `${side.width}px ${side.style} ${side.color}`
    : undefined;
}

function inlineTextStyle(value) {
  return {
    bottom: undefined,
    display: value.display,
    left: undefined,
    marginInlineStart: dimension(value.marginStart),
    position: 'static',
    right: undefined,
    top: undefined,
    verticalAlign: dimension(value.verticalAlign),
    zIndex: undefined,
  };
}

function layoutStyle(value = {}) {
  const flex = value.mode === 'flex';
  return {
    alignItems: alignmentStyle(value.align, flex),
    columnGap: dimension(value.gap?.column),
    display: value.mode,
    flexDirection: flex ? value.direction : undefined,
    flexWrap: flex ? value.wrap : undefined,
    gridTemplateColumns: !flex && value.columns?.length > 0
      ? value.columns.map(gridTrackStyle).join(' ')
      : undefined,
    gridTemplateRows: !flex && value.rows?.length > 0
      ? value.rows.map(gridTrackStyle).join(' ')
      : undefined,
    justifyContent: justificationStyle(value.justify, flex),
    paddingBottom: dimension(value.padding?.bottom),
    paddingLeft: dimension(value.padding?.left),
    paddingRight: dimension(value.padding?.right),
    paddingTop: dimension(value.padding?.top),
    rowGap: dimension(value.gap?.row),
  };
}

function layoutItemStyle(value) {
  if (!value) return {};
  return {
    alignSelf: value.align === 'auto' ? 'auto' : alignmentStyle(value.align, true),
    flexBasis: dimension(value.basis),
    flexGrow: value.grow,
    flexShrink: value.shrink,
    gridColumn: gridPlacementStyle(value.column),
    gridRow: gridPlacementStyle(value.row),
    order: value.order,
  };
}

function gridTrackStyle(value) {
  if (value.kind === 'fixed') return dimension(value.value);
  if (value.kind === 'fraction') return `${value.value}fr`;
  if (value.kind === 'auto') return 'auto';
  if (value.kind === 'content') return `${value.size}-content`;
  return `minmax(${gridTrackStyle(value.min)}, ${gridTrackStyle(value.max)})`;
}

function gridPlacementStyle(value) {
  return value ? `${value.start} / span ${value.span}` : undefined;
}

function alignmentStyle(value = 'stretch', flex) {
  if (!flex || !['start', 'end'].includes(value)) return value;
  return `flex-${value}`;
}

function justificationStyle(value = 'start', flex) {
  if (!flex || !['start', 'end'].includes(value)) return value;
  return `flex-${value}`;
}

function transformOperationStyle(value) {
  switch (value.kind) {
    case 'translate': return `translate3d(${dimension(value.x)}, ${dimension(value.y)}, ${value.z}px)`;
    case 'translate-2d': return `translate(${dimension(value.x)}, ${dimension(value.y)})`;
    case 'translate-x': return `translateX(${dimension(value.value)})`;
    case 'translate-y': return `translateY(${dimension(value.value)})`;
    case 'translate-z': return `translateZ(${dimension(value.value)})`;
    case 'rotate-x': return `rotateX(${value.degrees}deg)`;
    case 'rotate-y': return `rotateY(${value.degrees}deg)`;
    case 'rotate-z': return `rotateZ(${value.degrees}deg)`;
    case 'rotate-3d': return `rotate3d(${value.x}, ${value.y}, ${value.z}, ${value.degrees}deg)`;
    case 'scale': return `scale3d(${value.x}, ${value.y}, ${value.z})`;
    case 'scale-2d': return value.x === value.y
      ? `scale(${value.x})`
      : `scale(${value.x}, ${value.y})`;
    case 'skew': return `skew(${value.x}deg, ${value.y}deg)`;
    case 'perspective': return `perspective(${value.depth}px)`;
    default: throw new TypeError(`Unsupported transform operation ${value.kind}`);
  }
}

function filterStyle(value) {
  if (value.kind === 'svg-filter-ref') return `url(#${value.id})`;
  if (value.kind === 'hue-rotate') return `hue-rotate(${value.degrees}deg)`;
  if (value.kind === 'drop-shadow') {
    return `drop-shadow(${value.x}px ${value.y}px ${value.blur}px ${value.color})`;
  }
  const suffix = value.kind === 'blur' ? 'px' : '';
  return `${value.kind}(${value.amount}${suffix})`;
}

function shadowsStyle(values = [], box = false) {
  if (!values || values.length === 0) return undefined;
  return values.map((value) => [
    value.inset ? 'inset' : '',
    `${value.x}px`,
    `${value.y}px`,
    `${value.blur}px`,
    box ? `${value.spread}px` : '',
    value.color,
  ].filter(Boolean).join(' ')).join(', ');
}

function pointStyle(value) {
  return `${dimension(value.x)} ${dimension(value.y)}`;
}

function cssString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function shotMediaDefaults(state, inherited) {
  let backend = inherited?.backend;
  if (Object.hasOwn(state, 'mediaBackend')) {
    if (!['video', 'offthread-video'].includes(state.mediaBackend)) {
      throw new TypeError('Shot mediaBackend must be video or offthread-video');
    }
    backend = state.mediaBackend;
  }
  if (Object.hasOwn(state, 'pauseWhenBuffering')
    && typeof state.pauseWhenBuffering !== 'boolean') {
    throw new TypeError('Shot pauseWhenBuffering must be boolean');
  }
  const pauseWhenBuffering = Object.hasOwn(state, 'pauseWhenBuffering')
    ? state.pauseWhenBuffering === true
    : inherited?.pauseWhenBuffering === true;
  return Object.freeze({ backend, pauseWhenBuffering });
}

function requireDistinctShotKeys(children) {
  const keys = new Set();
  for (const child of children) {
    if (!(child instanceof Shot) || child.reconciliationKey === null) continue;
    if (keys.has(child.reconciliationKey)) {
      throw new TypeError('Sibling Shots require distinct reconciliation keys');
    }
    keys.add(child.reconciliationKey);
  }
}

function resolvedVideoState(state, defaults) {
  return Object.freeze({
    ...state,
    backend: state.backend === 'auto' && defaults?.backend
      ? defaults.backend
      : state.backend,
    pauseWhenBuffering: state.pauseWhenBuffering || defaults?.pauseWhenBuffering === true,
  });
}

function dimension(value) {
  return typeof value === 'number' ? `${value}px` : value;
}

function fragment(React, children) {
  return React.createElement(React.Fragment ?? 'div', null, ...children);
}
