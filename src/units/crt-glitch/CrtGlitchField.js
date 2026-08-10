import { Unit } from '@cut3/agent-memory/core/Unit';

const VARIANTS = Object.freeze(['film-field', 'glitch-title']);
const SIGNAL_TARGETS = new WeakMap();
const FIELD_CAPABILITY = Object.freeze({
  contract: 'crt-glitch-field/v1',
  kind: 'native-dom',
});
const SIGNAL_CAPABILITY = Object.freeze({
  contract: 'crt-glitch-signal/v1',
  kind: 'native-canvas-2d',
});

/** Semantic full-frame CRT field with one authored signal child. */
export class CrtGlitchField extends Unit {
  static kind = 'unit.crt-glitch.field';

  #animationTargets;

  constructor(variant, content) {
    const recipe = String(variant);
    if (!VARIANTS.includes(recipe)) {
      throw new TypeError('CrtGlitchField variant is not authored');
    }
    if (recipe === 'film-field' && content !== undefined) {
      throw new TypeError('film-field does not accept runtime text');
    }

    super();
    this.capability = FIELD_CAPABILITY;
    this.name = 'crt-glitch-field';
    this.present = true;
    this.style = {
      inset: 0,
      overflow: 'hidden',
      position: 'absolute',
    };
    this.variant = recipe;

    const signal = new CrtSignal(recipe, recipe === 'glitch-title' ? content : '');
    this.addUnit(signal);
    const signalTarget = Object.freeze({
      owner: signal,
      variant: recipe,
    });
    SIGNAL_TARGETS.set(signal, signalTarget);
    this.#animationTargets = Object.freeze({
      signal: signalTarget,
    });
  }

  /** Frozen semantic signal owner without positional child lookup. */
  animationTargets() {
    return this.#animationTargets;
  }
}

/** Compact CRT signal state. Hosts decide which native canvas component owns it. */
export class CrtSignal extends Unit {
  static kind = 'unit.crt-glitch.signal';

  constructor(variant, content = '') {
    const recipe = requireVariant(variant);
    super();
    this.capability = SIGNAL_CAPABILITY;
    this.content = String(content);
    this.height = 1920;
    this.name = 'crt-signal';
    this.present = true;
    this.variant = recipe;
    this.width = 1080;
    this.frameState = recipe === 'film-field'
      ? { frame: 0, grainSeed: 104729 }
      : { frame: 0, opacity: 0, shakeY: 0, splitAmount: 0 };
  }

  /** Execute this family's authored drawing function against a native 2D context. */
  draw(context, state = this) {
    drawCrtSignal(context, state);
  }
}

/** Family-local native adapters; the host supplies the component that owns canvas lifecycle. */
export function createCrtGlitchUnitRenderers(CanvasHost) {
  if (CanvasHost == null) {
    throw new TypeError('createCrtGlitchUnitRenderers requires a native canvas host');
  }
  return Object.freeze({
    [CrtGlitchField.kind]: renderCrtGlitchField,
    [CrtSignal.kind]: ({ React, state, unit }) => React.createElement(CanvasHost, {
      'data-memory-unit': CrtSignal.kind,
      draw: (context) => unit.draw(context, state),
      frameState: state.frameState,
      height: state.height,
      style: {
        display: 'block',
        height: '100%',
        width: '100%',
      },
      variant: state.variant,
      width: state.width,
    }),
  });
}

function renderCrtGlitchField({ React, renderChildren, state }) {
  return React.createElement('div', {
    'data-memory-unit': CrtGlitchField.kind,
    style: state.style,
  }, ...renderChildren());
}

/** Closed semantic signal contract used only by the complete analog cadence. */
export function requireCrtSignalTarget(unit) {
  const target = SIGNAL_TARGETS.get(unit);
  if (!target) {
    throw new TypeError('AnalogScanBurst requires an authored CRT signal target');
  }
  return target;
}

/** Draw one projected CRT signal without a command model or interpreter. */
export function drawCrtSignal(context, state) {
  if (!context || typeof context.clearRect !== 'function') {
    throw new TypeError('drawCrtSignal requires a CanvasRenderingContext2D');
  }
  context.save();
  try {
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    if (state.variant === 'film-field') drawFilmField(context, state);
    else if (state.variant === 'glitch-title') drawGlitchTitle(context, state);
    else throw new TypeError('drawCrtSignal requires projected CRT state');
  } finally {
    context.restore();
  }
}

function drawFilmField(context, state) {
  const { height, width } = state;
  const { grainSeed } = state.frameState;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.sqrt((centerX * centerX) + (centerY * centerY));

  context.clearRect(0, 0, width, height);
  const vignette = context.createRadialGradient(
    centerX,
    centerY,
    radius * 0.25,
    centerX,
    centerY,
    radius,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.45, 'rgba(0,0,0,0.03)');
  vignette.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 2800; index += 1) {
    const sample = index * 4;
    const x = mulberrySample(grainSeed, sample) * width;
    const y = mulberrySample(grainSeed, sample + 1) * height;
    const brightness = mulberrySample(grainSeed, sample + 2) > 0.5 ? 255 : 0;
    const alpha = 0.03 + (mulberrySample(grainSeed, sample + 3) * 0.03);
    context.fillStyle = `rgba(${brightness},${brightness},${brightness},${alpha})`;
    context.fillRect(x, y, 1.5, 1.5);
  }

  context.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < height; y += 2) context.fillRect(0, y, width, 1);

  drawCornerGlow(context, 0, 0);
  drawCornerGlow(context, width, 0);
  drawCornerGlow(context, 0, height);
  drawCornerGlow(context, width, height);
}

function drawCornerGlow(context, x, y) {
  const radius = 420;
  const glow = context.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, 'rgba(60,0,80,0.15)');
  glow.addColorStop(0.55, 'rgba(60,0,80,0.06)');
  glow.addColorStop(1, 'rgba(60,0,80,0)');
  context.fillStyle = glow;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawGlitchTitle(context, state) {
  const { content, height, width } = state;
  const { opacity, shakeY, splitAmount } = state.frameState;
  const x = width / 2;
  const y = 1700;

  context.clearRect(0, 0, width, height);
  const glow = {
    fill: '#ff000080',
    opacity,
    shadow: { blur: 20, color: '#ff000080', x: 0, y: 0 },
  };
  drawText(context, content, x, y, glow);
  drawText(context, content, x, y, glow);
  if (splitAmount > 0.4) {
    drawText(context, content, x - splitAmount, y + shakeY, {
      fill: '#ff0000',
      opacity: Math.min(opacity, 0.65),
    });
    drawText(context, content, x + splitAmount, y - shakeY, {
      fill: '#0099ff',
      opacity: Math.min(opacity, 0.65),
    });
  }
  drawText(context, content, x, y, {
    opacity,
    stroke: '#440000',
  });
  drawText(context, content, x, y, {
    fill: '#ff0000',
    opacity,
  });
}

function drawText(context, text, x, y, options) {
  context.globalAlpha = options.opacity;
  context.globalCompositeOperation = 'source-over';
  context.font = 'normal 400 120px Impact';
  context.textBaseline = 'alphabetic';
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.shadowOffsetX = options.shadow?.x ?? 0;
  context.shadowOffsetY = options.shadow?.y ?? 0;
  context.shadowBlur = options.shadow?.blur ?? 0;
  context.shadowColor = options.shadow?.color ?? 'rgba(0,0,0,0)';

  const glyphs = text.split('');
  const widths = glyphs.map((glyph) => context.measureText(glyph).width);
  const runWidth = widths.reduce((total, width) => total + width, 0)
    + (Math.max(0, glyphs.length - 1) * 18);
  context.textAlign = 'left';
  if (options.fill) {
    context.fillStyle = options.fill;
    drawGlyphs(context, glyphs, widths, x - (runWidth / 2), y, 'fill');
  }
  if (options.stroke) {
    context.strokeStyle = options.stroke;
    drawGlyphs(context, glyphs, widths, x - (runWidth / 2), y, 'stroke');
  }
}

function drawGlyphs(context, glyphs, widths, start, y, operation) {
  let x = start;
  for (let index = 0; index < glyphs.length; index += 1) {
    if (operation === 'fill') context.fillText(glyphs[index], x, y);
    else context.strokeText(glyphs[index], x, y);
    x += widths[index] + 18;
  }
}

function requireVariant(value) {
  const variant = String(value);
  if (!VARIANTS.includes(variant)) throw new TypeError('CrtSignal variant is not authored');
  return variant;
}

function mulberrySample(seed, index) {
  const state = (seed + (Math.imul(index + 1, 0x6d2b79f5))) | 0;
  let value = Math.imul(state ^ (state >>> 15), 1 | state);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
