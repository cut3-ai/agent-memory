/**
 * A Behaviour is executable, frame-dependent logic attached to a Unit.
 *
 * The callback is deliberately pure: Remotion may render frame 500 before
 * frame 10, so a behaviour reads the value for the current render instead of
 * accumulating `dt` state.
 */
export class Behaviour {
  constructor({ id, read, channel = 'value', path = [], metadata = {} } = {}) {
    if (typeof read !== 'function') {
      throw new TypeError('Behaviour requires a read() function');
    }
    this.kind = 'behaviour';
    this.id = id ?? 'behaviour.anonymous';
    this.unit = undefined;
    this.channel = channel;
    this.path = [...path];
    this.metadata = { ...metadata };
    this.read = read;
  }

  attach(unit, path = this.path) {
    this.unit = unit;
    this.path = [...path];
    return this;
  }

  onAdded() {}

  onRemoved() {}

  onFrame(context = {}) {
    return this.read(context);
  }
}

export class PropertyBehaviour extends Behaviour {
  constructor(options = {}) {
    super({ ...options, channel: options.channel ?? 'property' });
  }
}

export class OpacityBehaviour extends PropertyBehaviour {
  constructor(options = {}) {
    super({ path: ['style', 'opacity'], ...options, channel: 'opacity' });
  }
}

export class TransformBehaviour extends PropertyBehaviour {
  constructor(options = {}) {
    super({ path: ['style', 'transform'], ...options, channel: options.channel ?? 'transform' });
  }
}

export class ScaleBehaviour extends TransformBehaviour {
  constructor(options = {}) {
    super({ ...options, channel: 'scale' });
  }

  onFrame(context = {}) {
    return transformParts(super.onFrame(context), 'scale', this.metadata.operationIndex);
  }
}

export class TranslateBehaviour extends TransformBehaviour {
  constructor(options = {}) {
    super({ ...options, channel: 'translate' });
  }

  onFrame(context = {}) {
    return transformParts(super.onFrame(context), 'translate', this.metadata.operationIndex);
  }
}

export class RotateBehaviour extends TransformBehaviour {
  constructor(options = {}) {
    super({ ...options, channel: 'rotate' });
  }

  onFrame(context = {}) {
    return transformParts(super.onFrame(context), 'rotate', this.metadata.operationIndex);
  }
}

export class ContentBehaviour extends Behaviour {
  constructor(options = {}) {
    super({ path: ['children'], ...options, channel: 'content' });
  }
}

export class AttributeBehaviour extends PropertyBehaviour {
  constructor(options = {}) {
    super({ ...options, channel: options.channel ?? 'attribute' });
  }
}

export class CanvasDrawBehaviour extends Behaviour {
  constructor({ setup, ...options } = {}) {
    super({ ...options, channel: 'canvas-draw' });
    if (typeof setup !== 'function') {
      throw new TypeError('CanvasDrawBehaviour requires a setup() function');
    }
    this.setup = setup;
    this.cleanup = undefined;
  }

  onAdded() {
    this.cleanup = this.setup();
    return typeof this.cleanup === 'function'
      ? () => this.onRemoved()
      : undefined;
  }

  onRemoved() {
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    return typeof cleanup === 'function' ? cleanup() : undefined;
  }
}

export class ThreePropertyBehaviour extends PropertyBehaviour {
  constructor(options = {}) {
    super({ ...options, channel: options.channel ?? 'three-property' });
  }
}

export class LifecycleBehaviour extends Behaviour {
  constructor({ setup, ...options } = {}) {
    super({ ...options, read: options.read ?? (() => undefined), channel: options.channel ?? 'lifecycle' });
    if (typeof setup !== 'function') {
      throw new TypeError('LifecycleBehaviour requires a setup() function');
    }
    this.setup = setup;
    this.cleanup = undefined;
  }

  onAdded() {
    this.cleanup = this.setup();
    return typeof this.cleanup === 'function'
      ? () => this.onRemoved()
      : undefined;
  }

  onRemoved() {
    const cleanup = this.cleanup;
    this.cleanup = undefined;
    return typeof cleanup === 'function' ? cleanup() : undefined;
  }
}

/** One rendered value can be driven by several independent atomic behaviours. */
export class BehaviourGroup {
  constructor(behaviours, read) {
    this.kind = 'behaviour-group';
    this.behaviours = behaviours;
    this.managedChannels = new Set(behaviours.map((behaviour) => behaviour.channel));
    this.read = read;
  }

  attach(unit, path = []) {
    for (const behaviour of this.behaviours) behaviour.attach(unit, path);
    return this;
  }

  onFrame(context = {}) {
    if (!this.behaviours.every((behaviour) => isTransformChannel(behaviour.channel))) {
      return this.behaviours.at(-1)?.onFrame(context) ?? this.read(context);
    }
    const original = this.read(context);
    if (typeof original !== 'string') {
      return this.behaviours.at(-1)?.onFrame(context) ?? original;
    }
    const replacements = new Map();
    for (const behaviour of this.behaviours) {
      const values = replacements.get(behaviour.channel) ?? [];
      values.push(behaviour.onFrame(context));
      replacements.set(behaviour.channel, values);
    }
    const used = new Map();
    return tokenizeTransforms(original).flatMap((token) => {
      const channel = transformChannel(token);
      if (!this.managedChannels.has(channel)) return [token];
      const index = used.get(channel) ?? 0;
      used.set(channel, index + 1);
      const replacement = replacements.get(channel)?.[index];
      return replacement ? [replacement] : [];
    }).join(' ');
  }
}

export function createBehaviour(options = {}) {
  const constructors = {
    opacity: OpacityBehaviour,
    transform: TransformBehaviour,
    scale: ScaleBehaviour,
    translate: TranslateBehaviour,
    rotate: RotateBehaviour,
    content: ContentBehaviour,
    attribute: AttributeBehaviour,
    'svg-attribute': AttributeBehaviour,
    'canvas-draw': CanvasDrawBehaviour,
    'three-property': ThreePropertyBehaviour,
    'three-effect': LifecycleBehaviour,
    lifecycle: LifecycleBehaviour,
  };
  const BehaviourClass = constructors[options.channel] ?? PropertyBehaviour;
  return new BehaviourClass(options);
}

function transformParts(value, channel, operationIndex = 0) {
  if (typeof value !== 'string') return value;
  const names = {
    scale: 'scale(?:3d|x|y|z)?',
    translate: 'translate(?:3d|x|y|z)?',
    rotate: 'rotate(?:3d|x|y|z)?',
  };
  const expression = new RegExp(`${names[channel]}\\([^)]*\\)`, 'gi');
  const matches = value.match(expression);
  return matches?.[operationIndex] ?? matches?.[0] ?? '';
}

function isTransformChannel(channel) {
  return ['scale', 'translate', 'rotate', 'transform'].includes(channel);
}

function transformChannel(token) {
  const name = /^([a-z0-9]+)/i.exec(token)?.[1]?.toLowerCase() ?? '';
  if (name.startsWith('scale')) return 'scale';
  if (name.startsWith('translate')) return 'translate';
  if (name.startsWith('rotate')) return 'rotate';
  return 'transform';
}

function tokenizeTransforms(value) {
  const tokens = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (/\s/.test(character) && depth === 0) {
      const token = value.slice(start, index).trim();
      if (token) tokens.push(token);
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) tokens.push(tail);
  return tokens;
}
