import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import {
  EmulsionSurface,
} from '@cut3/agent-memory/units/turbulent-emulsion/EmulsionOverlay';
import {
  bindEmulsionTarget,
} from '@cut3/agent-memory/units/turbulent-emulsion/emulsionSemantics';

const CUE_LAYOUT = Object.freeze([
  Object.freeze({ x: '45%', y: '35%', size: 165 }),
  Object.freeze({ x: '55%', y: '40%', size: 165 }),
  Object.freeze({ x: '50%', y: '46%', size: 158 }),
  Object.freeze({ x: '42%', y: '53%', size: 165 }),
  Object.freeze({ x: '58%', y: '58%', size: 165 }),
  Object.freeze({ x: '47%', y: '63%', size: 165 }),
  Object.freeze({ x: '50%', y: '70%', size: 330 }),
]);
const TITLE_VARIANTS = Object.freeze(['handwritten-cues', 'neon-trace']);

/** Runtime cue copy or a content-free, hand-drawn neon trace. */
export class HandwrittenEmulsionTitle extends Layer {
  static kind = 'unit.turbulent-emulsion.handwritten-title';

  #animationTargets;
  #runtimeTexts;
  #surface;

  constructor(texts, variant) {
    const recipe = String(variant);
    if (!TITLE_VARIANTS.includes(recipe)) {
      throw new TypeError('HandwrittenEmulsionTitle variant is not authored');
    }
    if (!Array.isArray(texts)) {
      throw new TypeError('HandwrittenEmulsionTitle requires a Text Unit array');
    }
    const expectedCount = recipe === 'handwritten-cues' ? CUE_LAYOUT.length : 0;
    if (texts.length !== expectedCount) {
      throw new TypeError('HandwrittenEmulsionTitle runtime cardinality is not authored');
    }
    for (const text of texts) {
      requireUnit(text, 'HandwrittenEmulsionTitle text');
      requireDetachedUnit(text, 'HandwrittenEmulsionTitle text');
      if (text.constructor.kind !== 'unit.text') {
        throw new TypeError('HandwrittenEmulsionTitle requires Text Units');
      }
    }
    if (new Set(texts).size !== texts.length) {
      throw new TypeError('HandwrittenEmulsionTitle requires distinct Text Units');
    }

    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'visible',
      name: 'handwritten-emulsion-title',
    });
    this.variant = recipe;
    this.#runtimeTexts = Object.freeze([...texts]);
    this.#surface = new EmulsionSurface(recipe);
    this.addUnit(this.#surface);

    if (recipe === 'handwritten-cues') {
      const cueTargets = texts.map((text, index) => {
        styleCueText(text, CUE_LAYOUT[index]);
        this.addUnit(text);
        return bindEmulsionTarget(text, recipe, 'cue', index, ['flicker']);
      });
      const surfaceTarget = bindEmulsionTarget(
        this.#surface,
        recipe,
        'surface',
        0,
        ['drift'],
      );
      this.#animationTargets = Object.freeze({
        drift: Object.freeze([surfaceTarget]),
        flicker: Object.freeze(cueTargets),
      });
      return;
    }

    const surfaceTarget = bindEmulsionTarget(
      this.#surface,
      recipe,
      'neon',
      0,
      ['drift'],
    );
    this.#animationTargets = Object.freeze({
      drift: Object.freeze([surfaceTarget]),
      flicker: Object.freeze([]),
    });
  }

  animationTargets() {
    return this.#animationTargets;
  }

  nativeSurface() {
    return this.#surface;
  }

  runtimeTexts() {
    return this.#runtimeTexts;
  }
}

function styleCueText(text, layout) {
  text.effects = {
    ...text.effects,
    filters: [{ kind: 'svg-filter-ref', id: 'emulsion-main' }],
  };
  text.frame = {
    x: layout.x,
    y: layout.y,
    width: 'auto',
    height: 'auto',
  };
  text.paint = { ...text.paint, color: '#0a0a0a' };
  text.pose = {
    ...text.pose,
    operations: [{ kind: 'translate-2d', x: '-50%', y: '-50%' }],
  };
  text.typography = {
    ...text.typography,
    align: 'left',
    family: 'Estonia, cursive',
    letterSpacing: 2,
    lineHeight: 1,
    size: layout.size,
    style: 'normal',
    transform: 'none',
    weight: 600,
    wrap: {
      ...text.typography.wrap,
      whiteSpace: 'nowrap',
    },
  };
  text.present = false;
}
