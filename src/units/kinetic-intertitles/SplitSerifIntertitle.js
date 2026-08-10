import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

const SHIMMER_VARIANTS = Object.freeze(['shimmer', 'shimmer-hold']);
const TRACE_VARIANTS = Object.freeze(['trace', 'trace-reprise']);
const VARIANTS = Object.freeze([...SHIMMER_VARIANTS, ...TRACE_VARIANTS]);
const TARGETS = new WeakMap();
const SHIMMER_SHADOWS = Object.freeze([
  Object.freeze({ x: 0, y: 0, blur: 14, color: 'rgba(255,96,96,0.5)' }),
  Object.freeze({ x: 0, y: 0, blur: 28, color: 'rgba(255,80,80,0.2)' }),
  Object.freeze({ x: 2, y: 2, blur: 0, color: 'rgba(255,128,128,0.4)' }),
]);
const TRACE_SHADOWS = Object.freeze([
  Object.freeze({ x: 0, y: 0, blur: 14, color: '#ff6060' }),
  Object.freeze({ x: 0, y: 0, blur: 32, color: 'rgba(255,96,96,0.45)' }),
  Object.freeze({ x: 0, y: 0, blur: 60, color: 'rgba(255,96,96,0.2)' }),
]);
const PROGRESS_TRACE_PATH = 'M6 0 C6 0 12 9 12 11 C12 13.8 9.3 16 6 16 C2.7 16 0 13.8 0 11 C0 9 6 0 6 0 Z';

/** Runtime serif word row with natural flow, a clipped gradient band and last-word tear. */
export class SplitSerifIntertitle extends Layer {
  static kind = 'unit.kinetic-intertitles.split-serif';

  #animationTargets;

  constructor(words, variant) {
    validateWords(words);
    const authored = String(variant);
    if (!VARIANTS.includes(authored)) {
      throw new TypeError('SplitSerifIntertitle variant is not authored');
    }

    words.forEach((word) => styleWord(word, authored));
    const shimmer = SHIMMER_VARIANTS.includes(authored);
    const sweep = createShimmerSweep(shimmer);
    const trace = new SplitSerifProgressTrace(!shimmer);
    const structure = shimmer
      ? createShimmerRow(words, sweep, trace)
      : createTraceRow(words, sweep, trace);
    const row = new Layout(structure.row, {
      frame: { x: 0, y: 1720, right: 0, height: 'auto' },
      layout: { direction: 'row', justify: 'center' },
      name: 'split-serif-stage-row',
    });

    super(row, {
      frame: { x: 0, y: 0, width: 1080, height: 1920 },
      name: 'split-serif-intertitle',
    });

    const wordTargets = structure.wordOwners.map((owner, index) => registerTarget(owner, {
      count: words.length,
      index,
      role: 'word',
      variant: authored,
    }));
    const sweepTarget = registerTarget(sweep, { role: 'sweep', variant: authored });
    const traceTarget = registerTarget(trace, { role: 'trace', variant: authored });
    this.#animationTargets = Object.freeze({
      sweep: Object.freeze({ owner: sweepTarget, role: 'sweep' }),
      trace: Object.freeze({ owner: traceTarget, role: 'trace' }),
      words: Object.freeze(wordTargets.map((owner, index) => Object.freeze({
        index,
        owner,
        role: 'word',
      }))),
    });
  }

  /** Named projection owners; application code never constructs or indexes accent geometry. */
  animationTargets() {
    return this.#animationTargets;
  }
}

/** Semantic owner for the falling tear; the host may render it as one native SVG. */
export class SplitSerifProgressTrace extends Layer {
  static kind = 'unit.kinetic-intertitles.progress-trace';

  constructor(present) {
    super(undefined, {
      frame: { y: 64, right: -6, width: 12, height: 16 },
      name: 'split-serif-progress-trace',
      opacity: 0,
      present,
    });
  }
}

/** Direct family renderer: one authored path, no vector graph or definition compiler. */
export function renderSplitSerifProgressTrace({ React, state }) {
  if (typeof React?.createElement !== 'function') {
    throw new TypeError('renderSplitSerifProgressTrace requires React.createElement');
  }
  if (!state?.frame) {
    throw new TypeError('renderSplitSerifProgressTrace requires projected trace state');
  }
  return React.createElement('svg', {
    'aria-hidden': true,
    focusable: false,
    style: {
      filter: 'drop-shadow(0 0 5px #ff6060) drop-shadow(0 0 10px rgba(255,96,96,0.5))',
      height: state.frame.height,
      opacity: state.opacity,
      pointerEvents: 'none',
      position: state.frame.position,
      right: state.frame.right,
      top: state.frame.y,
      width: state.frame.width,
    },
    viewBox: '0 0 12 16',
  }, React.createElement('path', {
    d: PROGRESS_TRACE_PATH,
    fill: '#ff7070',
  }));
}

export function requireSplitSerifTarget(unit, role, name) {
  requireUnit(unit, `${name} owner`);
  const target = TARGETS.get(unit);
  if (!target || target.role !== role) {
    throw new TypeError(`${name} requires a SplitSerifIntertitle ${role} owner`);
  }
  return unit;
}

export function splitSerifTarget(unit, role, name) {
  requireSplitSerifTarget(unit, role, name);
  return TARGETS.get(unit);
}

function createShimmerRow(words, sweep, trace) {
  const row = new Layout(words[0], {
    frame: { position: 'relative', width: 'auto', height: 'auto' },
    layout: {
      direction: 'row',
      gap: 15,
      justify: 'center',
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
    },
    overflow: 'hidden',
    name: 'split-serif-shimmer-row',
  });
  words.slice(1).forEach((word) => row.addUnit(word));
  row.addUnit(sweep);
  row.addUnit(trace);
  return Object.freeze({ row, wordOwners: Object.freeze([...words]) });
}

function createTraceRow(words, sweep, trace) {
  const last = words.at(-1);
  const cluster = new Layer(last, {
    frame: { position: 'relative', width: 'auto', height: 'auto' },
    name: 'split-serif-last-word-cluster',
  });
  cluster.addUnit(trace);
  const first = words.length === 1 ? cluster : words[0];
  const row = new Layout(first, {
    frame: { position: 'relative', width: 'auto', height: 'auto' },
    layout: { align: 'center', direction: 'row', gap: 18.56 },
    name: 'split-serif-trace-row',
  });
  words.slice(1, -1).forEach((word) => row.addUnit(word));
  if (words.length > 1) row.addUnit(cluster);
  row.addUnit(sweep);
  return Object.freeze({
    row,
    wordOwners: Object.freeze([...words.slice(0, -1), cluster]),
  });
}

function createShimmerSweep(present) {
  return new Box(undefined, {
    frame: { x: -280, y: 0, bottom: 0, width: 220 },
    name: 'split-serif-shimmer-sweep',
    opacity: 0,
    paint: {
      radius: 2,
      backgrounds: [{
        kind: 'linear-gradient',
        angle: 90,
        stops: [
          { offset: 0, color: 'transparent' },
          { offset: 0.25, color: 'rgba(255,240,245,0.15)' },
          { offset: 0.5, color: 'rgba(255,255,255,0.5)' },
          { offset: 0.75, color: 'rgba(255,240,245,0.15)' },
          { offset: 1, color: 'transparent' },
        ],
      }],
    },
    present,
  });
}

function registerTarget(owner, metadata) {
  TARGETS.set(owner, Object.freeze({ ...metadata }));
  return owner;
}

function styleWord(word, variant) {
  word.frame = {
    x: undefined,
    y: undefined,
    right: undefined,
    bottom: undefined,
    width: 'auto',
    height: 'auto',
    minWidth: undefined,
    maxWidth: undefined,
    minHeight: undefined,
    maxHeight: undefined,
    aspectRatio: undefined,
    boxSizing: 'border-box',
    position: 'static',
    z: 'auto',
  };
  word.paint = { ...word.paint, color: '#ffffff' };
  word.typography = {
    ...word.typography,
    align: 'left',
    family: 'Georgia, "Times New Roman", serif',
    letterSpacing: 3,
    lineHeight: 'normal',
    shadows: SHIMMER_VARIANTS.includes(variant) ? SHIMMER_SHADOWS : TRACE_SHADOWS,
    size: 58,
    style: 'italic',
    transform: 'none',
    weight: 400,
    wrap: { ...word.typography.wrap, whiteSpace: 'normal' },
  };
}

function validateWords(words) {
  if (!Array.isArray(words) || words.length === 0) {
    throw new TypeError('SplitSerifIntertitle requires runtime Text Units');
  }
  for (const [index, word] of words.entries()) {
    requireUnit(word, `SplitSerifIntertitle word ${index + 1}`);
    requireDetachedUnit(word, `SplitSerifIntertitle word ${index + 1}`);
    if (word.constructor.kind !== 'unit.text') {
      throw new TypeError('SplitSerifIntertitle requires Text Units');
    }
  }
  if (new Set(words).size !== words.length) {
    throw new TypeError('SplitSerifIntertitle requires distinct Text Units');
  }
}
