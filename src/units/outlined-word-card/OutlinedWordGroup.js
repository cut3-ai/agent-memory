import { Unit } from '@cut3/agent-memory/core/Unit';

const POSITIONS = Object.freeze({
  1: Object.freeze([[50, 50]]),
  2: Object.freeze([[30, 50], [70, 50]]),
  3: Object.freeze([[30, 42], [70, 42], [50, 62]]),
  4: Object.freeze([[30, 40], [70, 40], [30, 62], [70, 62]]),
});
const TARGET_BINDINGS = new WeakMap();

/** Full-frame semantic field binding runtime copy to authored cue slots. */
export class OutlinedWordGroup extends Unit {
  static kind = 'unit.outlined-word-card.word-group';

  #animationTargets;
  #runtimeWords;

  constructor(words, cues) {
    const runtimeText = requireRuntimeStrings(words);
    const cueSheet = requireCueSheet(cues, runtimeText.length);
    const runtimeWords = runtimeText.map((text, index) => new OutlinedRuntimeWord(
      text,
      cueSheet[index].groupSize,
    ));
    const stages = runtimeWords.map((word, index) => new OutlinedWordCue(
      word,
      cueSheet[index],
      index,
    ));
    super(stages[0]);
    stages.slice(1).forEach((stage) => this.addUnit(stage));
    this.present = true;
    this.style = Object.freeze({
      height: '100%',
      left: 0,
      position: 'absolute',
      top: 0,
      width: '100%',
    });
    this.#runtimeWords = Object.freeze(runtimeWords);
    this.#animationTargets = Object.freeze(stages.map((owner, index) => target(
      owner,
      runtimeWords[index],
      cueSheet[index],
      index,
    )));
  }

  /** Frozen semantic cue owners in authored word order. */
  animationTargets() {
    return this.#animationTargets;
  }

  /** Runtime word bindings without positional child traversal. */
  runtimeWords() {
    return this.#runtimeWords;
  }
}

class OutlinedWordCue extends Unit {
  static kind = 'unit.outlined-word-card.cued-word';

  constructor(word, cue, index) {
    const [xPercent, yPercent] = POSITIONS[cue.groupSize][cue.slot];
    super(word);
    this.present = false;
    this.style = Object.freeze({
      height: 'auto',
      left: `${xPercent}%`,
      position: 'absolute',
      top: `${yPercent}%`,
      transform: 'translate(-50%, -50%)',
      width: 'auto',
    });
    TARGET_BINDINGS.set(this, Object.freeze({ cue, index, owner: this, word }));
  }
}

class OutlinedRuntimeWord extends Unit {
  static kind = 'unit.outlined-word-card.runtime-word';

  constructor(text, groupSize) {
    super();
    const availableWidth = groupSize === 1 ? 980 : 500;
    const fontSize = Math.max(
      56,
      Math.min(132, Math.round(availableWidth / (text.length * 0.6))),
    );
    this.present = true;
    this.style = Object.freeze({
      color: '#fff',
      fontFamily: 'TheBoldFont, system-ui, sans-serif',
      fontSize: `${fontSize}px`,
      fontStyle: 'normal',
      fontWeight: 400,
      height: 'auto',
      letterSpacing: '0px',
      lineHeight: 'normal',
      paintOrder: 'stroke',
      textAlign: 'left',
      textShadow: '0px 6px 24px rgba(0,0,0,0.6)',
      textTransform: 'none',
      WebkitTextStroke: `${Math.round(fontSize * 0.09)}px #000`,
      whiteSpace: 'nowrap',
      width: 'auto',
    });
    this.text = text;
  }
}

/** Ordinary host-native DOM adapters for this direct-style family. */
export const outlinedWordCardUnitRenderers = Object.freeze({
  [OutlinedWordGroup.kind]: renderOutlinedWordGroup,
  [OutlinedWordCue.kind]: renderOutlinedWordCue,
  [OutlinedRuntimeWord.kind]: renderOutlinedRuntimeWord,
});

function renderOutlinedWordGroup({ React, renderChildren, state }) {
  return React.createElement('div', {
    'data-outlined-word-card': 'group',
    style: state.style,
  }, ...renderChildren());
}

function renderOutlinedWordCue({ React, renderChildren, state }) {
  return React.createElement('div', {
    'data-outlined-word-card': 'cue',
    style: state.style,
  }, ...renderChildren());
}

function renderOutlinedRuntimeWord({ React, state }) {
  return React.createElement('div', {
    'data-outlined-word-card': 'word',
    style: state.style,
  }, state.text);
}

/** Closed semantic role contract used by the authored cue Behaviour. */
export function requireOutlinedWordCueTarget(unit, index) {
  const binding = TARGET_BINDINGS.get(unit);
  if (!binding || binding.index !== index) {
    throw new TypeError('WordCueState requires an authored outlined-word cue owner');
  }
  return binding;
}

function requireRuntimeStrings(words) {
  if (!Array.isArray(words) || words.length === 0) {
    throw new TypeError('OutlinedWordGroup requires runtime strings');
  }
  const normalized = words.map((text, index) => {
    if (typeof text !== 'string') {
      throw new TypeError(`OutlinedWordGroup word ${index + 1} must be a string`);
    }
    return text;
  });
  return Object.freeze(normalized);
}

function requireCueSheet(cues, wordCount) {
  if (!Array.isArray(cues) || cues.length !== wordCount) {
    throw new TypeError('OutlinedWordGroup requires one cue per runtime word');
  }
  const normalized = Object.freeze(cues.map((cue, index) => cueRecord(cue, index, wordCount)));
  normalized.forEach((cue, index) => {
    if (index > 0 && cue.appearFrame < normalized[index - 1].appearFrame) {
      throw new RangeError('Outlined word cues must be ordered');
    }
    const groupStart = Math.floor(index / 4) * 4;
    if (cue.disappearFrame !== normalized[groupStart].disappearFrame) {
      throw new RangeError('Outlined word group cues must share an endpoint');
    }
    if (index > 0 && index % 4 === 0 && normalized[index - 1].disappearFrame !== cue.appearFrame) {
      throw new RangeError('Outlined word groups must hand off on one frame');
    }
  });
  return normalized;
}

function cueRecord(cue, index, wordCount) {
  if (!cue || typeof cue !== 'object' || Array.isArray(cue)) {
    throw new TypeError('Outlined word cue must be a plain object');
  }
  const appearFrame = integer(cue.appearFrame, 0, Number.MAX_SAFE_INTEGER, 'cue appearFrame');
  const disappearFrame = integer(
    cue.disappearFrame,
    appearFrame,
    Number.MAX_SAFE_INTEGER,
    'cue disappearFrame',
  );
  const groupStart = Math.floor(index / 4) * 4;
  const groupSize = Math.min(4, wordCount - groupStart);
  const slot = index - groupStart;
  if (cue.groupSize !== groupSize || cue.slot !== slot) {
    throw new RangeError('Outlined word cue does not match authored four-word grouping');
  }
  return Object.freeze({ appearFrame, disappearFrame, groupSize, slot });
}

function target(owner, word, cue, index) {
  return Object.freeze({ cue, index, owner, role: 'word-cue', word });
}

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}
