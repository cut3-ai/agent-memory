function objectSchema(properties, required = []) {
  return Object.freeze({
    type: 'object',
    properties: Object.freeze({ ...properties }),
    required: Object.freeze([...required]),
    additionalProperties: false,
  });
}

function unitRule(id, description, intents, contract, match) {
  return Object.freeze({
    id,
    kind: 'unit',
    description,
    intents: Object.freeze([...intents]),
    atomicity: Object.freeze({
      boundary: 'single-renderable',
      multiplicity: 'one-definition-many-instances',
    }),
    propsSchema: contract.propsSchema,
    providesCapabilities: Object.freeze([...contract.providesCapabilities]),
    match,
  });
}

function behaviorRule(id, description, intents, contract, channel) {
  return Object.freeze({
    id,
    kind: 'behavior',
    description,
    intents: Object.freeze([...intents]),
    atomicity: Object.freeze({
      boundary: 'single-visual-channel',
      multiplicity: 'one-definition-many-instances',
    }),
    configSchema: contract.configSchema,
    requiresCapabilities: Object.freeze([...contract.requiresCapabilities]),
    writes: Object.freeze([channel]),
    match: (ctx) => ctx.visualAtoms
      .filter((atom) => atom.channel === channel && atom.frameDriven)
      .map(atomOccurrence),
  });
}

const easingProperty = {
  type: 'string',
  enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring'],
};

function driverSchema(valueSchema) {
  const pointSchema = objectSchema({
    frame: { type: 'number' },
    value: valueSchema,
  }, ['frame', 'value']);
  return Object.freeze({
    oneOf: Object.freeze([
      objectSchema({
        kind: { const: 'keyframes' },
        points: { type: 'array', minItems: 2, items: pointSchema },
        easing: easingProperty,
      }, ['kind', 'points']),
      objectSchema({
        kind: { const: 'spring' },
        from: valueSchema,
        to: valueSchema,
        damping: { type: 'number', exclusiveMinimum: 0 },
        stiffness: { type: 'number', exclusiveMinimum: 0 },
        mass: { type: 'number', exclusiveMinimum: 0 },
      }, ['kind', 'from', 'to']),
      objectSchema({
        kind: { const: 'oscillation' },
        center: valueSchema,
        amplitude: valueSchema,
        frequencyHz: { type: 'number', exclusiveMinimum: 0 },
        phaseRadians: { type: 'number' },
        decay: { type: 'number', minimum: 0 },
      }, ['kind', 'center', 'amplitude', 'frequencyHz']),
      objectSchema({
        kind: { const: 'samples' },
        values: { type: 'array', minItems: 2, items: valueSchema },
        frameStep: { type: 'number', exclusiveMinimum: 0 },
        startFrame: { type: 'number' },
      }, ['kind', 'values', 'frameStep']),
    ]),
  });
}

function motionConfig(valueSchema, properties = {}) {
  return objectSchema({
    driver: driverSchema(valueSchema),
    ...properties,
  }, ['driver']);
}

const scalarValue = Object.freeze({ type: 'number' });
const opacityValue = Object.freeze({ type: 'number', minimum: 0, maximum: 1 });
const vectorValue = objectSchema({
  x: { type: 'number' },
  y: { type: 'number' },
}, ['x', 'y']);

/**
 * Only canonical, visual runtime blocks belong here. Arithmetic helpers,
 * timeline cardinality and combinations such as fade+scale are intentionally
 * absent: they can be dependencies or co-occurrence evidence, never entries.
 */
export const RULES = Object.freeze([
  behaviorRule(
    'motion.opacity',
    'Animate one unit opacity channel using configurable values and timing.',
    ['fade', 'reveal', 'opacity pulse', 'crossfade side'],
    {
      requiresCapabilities: ['style.opacity'],
      configSchema: motionConfig(opacityValue),
    },
    'opacity',
  ),
  behaviorRule(
    'motion.scale',
    'Animate one unit scale channel.',
    ['scale in', 'scale out', 'zoom'],
    {
      requiresCapabilities: ['transform.scale'],
      configSchema: motionConfig(scalarValue, {
        origin: { type: 'string' },
      }),
    },
    'transform.scale',
  ),
  behaviorRule(
    'motion.translate',
    'Animate one unit translation channel.',
    ['slide', 'pan', 'move', 'shake trajectory'],
    {
      requiresCapabilities: ['transform.translate'],
      configSchema: motionConfig(vectorValue, {
        unit: { type: 'string', enum: ['px', '%'] },
      }),
    },
    'transform.translate',
  ),
  behaviorRule(
    'motion.rotate',
    'Animate one unit rotation channel.',
    ['rotate', 'spin', 'tilt'],
    {
      requiresCapabilities: ['transform.rotate'],
      configSchema: motionConfig(scalarValue),
    },
    'transform.rotate',
  ),
  unitRule(
    'overlay.solid-fill',
    'Render one full-frame solid-color layer; white is a color prop, not a separate unit.',
    ['solid overlay', 'color fill', 'flash surface'],
    {
      providesCapabilities: ['render.dom', 'style.opacity'],
      propsSchema: objectSchema({
        color: { type: 'string' },
        opacity: { type: 'number', minimum: 0, maximum: 1 },
      }, ['color']),
    },
    (ctx) => fragmentOccurrences(ctx.visualFragments, (fragment) => (
      fragment.fullFrame
      && fragment.hasDirectColorBackground
      && fragment.childElementCount === 0
      && !fragment.hasCustomDescendant
      && !fragment.containsMedia
      && !fragment.hasText
      && !fragment.families.some((family) => ['canvas', 'svg', 'three'].includes(family))
    )),
  ),
  unitRule(
    'overlay.vignette',
    'Render one parameterized edge-darkening vignette layer.',
    ['vignette overlay', 'darken frame edges'],
    {
      providesCapabilities: ['render.dom', 'style.opacity'],
      propsSchema: objectSchema({
        color: { type: 'string' },
        strength: { type: 'number', minimum: 0, maximum: 1 },
        radius: { type: 'number', minimum: 0 },
      }),
    },
    (ctx) => fragmentOccurrences(ctx.visualFragments, (fragment) => (
      fragment.fullFrame
      && fragment.hasDirectVignetteGradient
      && fragment.childElementCount === 0
      && !fragment.hasCustomDescendant
      && !fragment.containsMedia
      && !fragment.hasText
    )),
  ),
  unitRule(
    'text.scatter-chunk',
    'Render one positioned text chunk; two or ten chunks reuse the same unit.',
    ['timed word chunk', 'scattered text item', 'positioned caption'],
    {
      providesCapabilities: ['render.dom', 'style.opacity', 'transform.translate'],
      propsSchema: objectSchema({
        text: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
      }, ['text']),
    },
    scatterChunkOccurrences,
  ),
  unitRule(
    'text.dialogue-card',
    'Render one parameterized dialogue or subtitle card.',
    ['dialogue card', 'subtitle card', 'speech caption'],
    {
      providesCapabilities: ['render.dom', 'style.opacity', 'transform.scale', 'transform.translate'],
      propsSchema: objectSchema({
        text: { type: 'string' },
        speaker: { type: 'string' },
        accentColor: { type: 'string' },
      }, ['text']),
    },
    dialogueCardOccurrences,
  ),
  unitRule(
    'card.ranking',
    'Render one parameterized ranking card; the number of cards belongs to composition data.',
    ['ranking card', 'countdown item', 'listicle item'],
    {
      providesCapabilities: ['render.dom', 'style.opacity', 'transform.scale', 'transform.translate'],
      propsSchema: objectSchema({
        rank: { type: 'number' },
        title: { type: 'string' },
        imageSrc: { type: 'string' },
      }, ['rank', 'title']),
    },
    (ctx) => fragmentOccurrences(ctx.visualFragments, (fragment) => (
      fragment.rootKind === 'div'
      && fragment.hasText
      && fragment.hasRankingSemantics
      && fragment.childElementCount >= 2
      && fragment.directStyleProperties.includes('position')
      && (fragment.directStyleProperties.includes('opacity')
        || fragment.directStyleProperties.includes('transform'))
    )),
  ),
]);

export function detectMatches(observation) {
  const ctx = createContext(observation);
  const matches = [];

  for (const definition of RULES) {
    try {
      for (const occurrence of definition.match(ctx) ?? []) {
        matches.push({
          id: definition.id,
          kind: definition.kind,
          ...occurrence,
        });
      }
    } catch {
      // A malformed local fragment must not abort the rest of a mining run.
    }
  }

  return matches.sort((left, right) => (
    left.id.localeCompare(right.id)
    || (left.span?.start ?? 0) - (right.span?.start ?? 0)
    || String(left.structuralHash).localeCompare(String(right.structuralHash))
  ));
}

export function detectSignals(observation) {
  return [...new Set(detectMatches(observation).map((match) => match.id))]
    .sort((left, right) => left.localeCompare(right));
}

function createContext(observation) {
  const code = observation?.code ?? {};
  const helperNames = (code.helpers ?? []).map((helper) => String(helper?.name ?? ''));
  return {
    observation,
    visualAtoms: Array.isArray(code.visualAtoms) ? code.visualAtoms : [],
    visualFragments: Array.isArray(code.visualFragments) ? code.visualFragments : [],
    isFrameDriven: code.features?.hasDeterministicFrame === true,
    hasTimingHelper: helperNames.some((name) => /^(?:ms2f|msToFrames)$/i.test(name)),
  };
}

function atomOccurrence(atom) {
  return {
    occurrenceKind: 'channel-write',
    channel: atom.channel,
    span: atom.span,
    dependencySpans: atom.dependencySpans,
    structuralHash: atom.expressionHash,
    variantHash: atom.variantHash,
    drivers: atom.drivers,
  };
}

function fragmentOccurrences(fragments, predicate) {
  const matches = fragments
    .filter(predicate)
    .sort((left, right) => (
      spanLength(left.span) - spanLength(right.span)
      || left.span.start - right.span.start
      || left.fragmentId.localeCompare(right.fragmentId)
    ));
  const selected = [];

  // If both a child and its enclosing wrapper match the same semantic rule,
  // the smallest coherent subtree owns the occurrence.
  for (const fragment of matches) {
    if (selected.some((item) => containsSpan(fragment.span, item.span))) continue;
    selected.push(fragment);
  }

  return selected.map((fragment) => ({
    occurrenceKind: 'renderable-fragment',
    span: fragment.span,
    dependencySpans: [],
    structuralHash: fragment.structuralHash,
    variantHash: fragment.structuralHash,
    rootKind: fragment.rootKind,
    renderFamilies: fragment.families,
  }));
}

function scatterChunkOccurrences(ctx) {
  const hasDialogue = ctx.visualFragments.some((fragment) => fragment.hasDialogueSemantics);
  const hasRanking = ctx.visualFragments.some((fragment) => fragment.hasRankingSemantics);
  if (hasDialogue || hasRanking) return [];

  const timedContainers = ctx.visualFragments.filter((fragment) => (
    fragment.hasText
    && fragment.hasMapShape
    && fragment.hasTimedScatterSemantics
  ));
  const positionedText = (fragment) => (
    fragment.hasText
    && fragment.directStyleProperties.includes('position')
    && (fragment.directStyleProperties.includes('left') || fragment.directStyleProperties.includes('top'))
  );

  const projectedChildren = ctx.visualFragments.filter((fragment) => (
    positionedText(fragment)
    && timedContainers.some((container) => containsSpan(container.span, fragment.span))
  ));
  const directTimedChunks = ctx.isFrameDriven && ctx.hasTimingHelper
    ? ctx.visualFragments.filter(positionedText)
    : [];
  const candidates = [...projectedChildren, ...directTimedChunks];
  const candidateIds = new Set(candidates.map((fragment) => fragment.fragmentId));
  return fragmentOccurrences(
    ctx.visualFragments,
    (fragment) => candidateIds.has(fragment.fragmentId),
  );
}

function dialogueCardOccurrences(ctx) {
  const semanticContainers = ctx.visualFragments.filter((fragment) => fragment.hasDialogueSemantics);
  const surfaceStyles = new Set(['background', 'backgroundColor', 'boxShadow']);
  return fragmentOccurrences(ctx.visualFragments, (fragment) => (
    fragment.rootKind === 'div'
    && fragment.hasText
    && fragment.childElementCount <= 2
    && fragment.directStyleProperties.some((style) => surfaceStyles.has(style))
    && semanticContainers.some((container) => containsSpan(container.span, fragment.span))
  ));
}

function spanLength(span) {
  return Math.max(0, Number(span?.end ?? 0) - Number(span?.start ?? 0));
}

function containsSpan(outer, inner) {
  return outer.start <= inner.start && outer.end >= inner.end;
}
