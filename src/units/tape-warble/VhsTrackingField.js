import { Unit } from '@cut3/agent-memory/core/Unit';

const SIGNAL_TARGETS = new WeakMap();

const FIELD_CAPABILITY = Object.freeze({
  contract: 'vhs-tracking-field/v1',
  kind: 'native-dom',
});
const SIGNAL_CAPABILITY = Object.freeze({
  contract: 'vhs-signal/v1',
  kind: 'native-canvas-2d',
});

/** Full-frame VHS tape distortion surface with canvas-drawn warble, sync roll, and timecode. */
export class VhsTrackingField extends Unit {
  static kind = 'unit.tape-warble.tracking-field';

  #animationTargets;

  constructor() {
    super();
    this.capability = FIELD_CAPABILITY;
    this.name = 'vhs-tracking-field';
    this.present = true;
    this.style = {
      inset: 0,
      overflow: 'hidden',
      position: 'absolute',
    };

    const signal = new VhsSignal();
    this.addUnit(signal);
    const signalTarget = Object.freeze({ owner: signal });
    SIGNAL_TARGETS.set(signal, signalTarget);
    this.#animationTargets = Object.freeze({ signal: signalTarget });
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

/** Canvas state carrier for the VHS tracking error drawing. */
export class VhsSignal extends Unit {
  static kind = 'unit.tape-warble.signal';

  constructor() {
    super();
    this.capability = SIGNAL_CAPABILITY;
    this.height = 1920;
    this.name = 'vhs-signal';
    this.present = true;
    this.width = 1080;
    this.frameState = {
      frame: 0,
      fps: 30,
      syncRollY: 960,
      warpAmplitude: 0,
    };
  }

  draw(context, state = this) {
    drawVhsTracking(context, state);
  }
}

/** Native renderer factory — supply the host's canvas component. */
export function createVhsTrackingUnitRenderers(CanvasHost) {
  if (CanvasHost == null) {
    throw new TypeError('createVhsTrackingUnitRenderers requires a native canvas host');
  }
  return Object.freeze({
    [VhsTrackingField.kind]: renderVhsTrackingField,
    [VhsSignal.kind]: ({ React, state, unit }) => React.createElement(CanvasHost, {
      'data-memory-unit': VhsSignal.kind,
      draw: (context) => unit.draw(context, state),
      frameState: state.frameState,
      height: state.height,
      style: { display: 'block', height: '100%', width: '100%' },
      width: state.width,
    }),
  });
}

/** Closed semantic contract consumed only by VhsTrackingError. */
export function requireVhsSignalTarget(unit) {
  const target = SIGNAL_TARGETS.get(unit);
  if (!target) {
    throw new TypeError('VhsTrackingError requires an authored VHS signal target');
  }
  return target;
}

function renderVhsTrackingField({ React, renderChildren, state }) {
  return React.createElement('div', {
    'data-memory-unit': VhsTrackingField.kind,
    style: state.style,
  }, ...renderChildren());
}

/** Full-frame VHS tracking error drawn into a 2D canvas context. */
function drawVhsTracking(context, state) {
  if (!context || typeof context.clearRect !== 'function') {
    throw new TypeError('drawVhsTracking requires a CanvasRenderingContext2D');
  }

  context.save();
  try {
    const { width, height } = state;
    const { frame, fps, syncRollY, warpAmplitude } = state.frameState;
    const grainSeed = (frame * 7919) + 104729;

    // Background
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#0b0b0b';
    context.fillRect(0, 0, width, height);

    // Film grain
    for (let i = 0; i < 2000; i += 1) {
      const gx = mulberry(grainSeed, i * 3) * width;
      const gy = mulberry(grainSeed, i * 3 + 1) * height;
      const bright = mulberry(grainSeed, i * 3 + 2) > 0.5 ? 210 : 55;
      context.fillStyle = `rgba(${bright},${bright},${bright},0.055)`;
      context.fillRect(gx, gy, 1.5, 1.5);
    }

    // Tape warble — banded horizontal displacement
    const bandH = 6;
    const numBands = Math.ceil(height / bandH);
    for (let bi = 0; bi < numBands; bi += 1) {
      const bandY = bi * bandH;
      const bandCenterY = bandY + bandH * 0.5;
      const distFromRoll = Math.abs(bandCenterY - syncRollY) / height;

      // Slow sinusoidal warble
      const phase = (bi * 0.38) + (frame * 0.12);
      const localNoise = (mulberry(grainSeed, bi + 500) - 0.5) * 2;
      const baseWarp = (Math.sin(phase) * 20) + (localNoise * 9);
      // Extreme tear near the sync roll band
      const rollProx = Math.max(0, 1 - distFromRoll * 14);
      const tearDir = mulberry(grainSeed, bi + 100) > 0.5 ? 1 : -1;
      const dx = (baseWarp * warpAmplitude) + (rollProx * 140 * tearDir);

      const alpha = 0.04 + mulberry(grainSeed, bi + 200) * 0.03;
      const luma = Math.round(170 + mulberry(grainSeed, bi + 300) * 85);
      context.fillStyle = `rgba(${luma},${luma},${Math.round(luma * 0.88)},${alpha.toFixed(3)})`;
      context.fillRect(dx, bandY, width, bandH - 1);

      // Chroma bleed on strong warp
      if (Math.abs(dx) > 28 && warpAmplitude > 0.25) {
        context.fillStyle = `rgba(190,40,230,${(alpha * 0.45).toFixed(3)})`;
        context.fillRect(dx - 9, bandY, width, bandH - 1);
        context.fillStyle = `rgba(30,210,230,${(alpha * 0.35).toFixed(3)})`;
        context.fillRect(dx + 14, bandY, width, bandH - 1);
      }
    }

    // Sync roll band
    const rollBandH = 88;
    const rollTop = syncRollY - rollBandH * 0.5;
    context.fillStyle = 'rgba(255,255,255,0.82)';
    context.fillRect(0, rollTop, width, 3);
    context.fillStyle = 'rgba(210,210,210,0.22)';
    context.fillRect(0, rollTop + 3, width, rollBandH - 6);
    context.fillStyle = 'rgba(0,0,0,0.58)';
    context.fillRect(0, rollTop + rollBandH - 3, width, 3);

    // Scanline overlay
    context.fillStyle = 'rgba(0,0,0,0.24)';
    for (let sy = 0; sy < height; sy += 3) {
      context.fillRect(0, sy, width, 1);
    }

    // Edge vignette
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = Math.sqrt((cx * cx) + (cy * cy));
    const vig = context.createRadialGradient(cx, cy, r * 0.28, cx, cy, r);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.55, 'rgba(0,0,0,0.08)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    context.fillStyle = vig;
    context.fillRect(0, 0, width, height);

    // Timecode burn-in
    drawTimecode(context, width, height, frame, fps);
  } finally {
    context.restore();
  }
}

function drawTimecode(context, width, height, frame, fps) {
  const safeFps = Math.max(1, fps);
  const totalSeconds = Math.floor(frame / safeFps);
  const fr = frame % safeFps;
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const text = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(fr)}`;

  const tx = width - 24;
  const ty = height - 44;

  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.font = 'bold 34px "Courier New", Courier, monospace';
  context.textAlign = 'right';
  context.textBaseline = 'bottom';

  // Shadow
  context.fillStyle = 'rgba(0,0,0,0.85)';
  context.fillText(text, tx + 2, ty + 2);
  // VHS phosphor green
  context.fillStyle = 'rgba(100,255,80,0.92)';
  context.fillText(text, tx, ty);
}

function pad(value) {
  return String(Math.floor(Math.abs(value))).padStart(2, '0');
}

// Mulberry32-inspired deterministic sampler
function mulberry(seed, index) {
  const state = (seed + Math.imul(index + 1, 0x6d2b79f5)) | 0;
  let v = Math.imul(state ^ (state >>> 15), 1 | state);
  v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
  return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
}
