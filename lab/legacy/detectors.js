import { parseExpression } from '@babel/parser';

import { sha256, stableStringify } from '../../src/lib.js';
import { stripRuntimeWrappers } from '../shared/normalize.js';

function motifRule(id, family, description, match) {
  return Object.freeze({
    id,
    family,
    kind: 'unit',
    description,
    atomicity: Object.freeze({
      boundary: 'connected-styled-subtree',
      multiplicity: 'one-definition-many-instances',
    }),
    match,
  });
}

function temporalMotifRule(id, family, description) {
  return Object.freeze({
    id,
    family,
    kind: 'behaviour',
    description,
    atomicity: Object.freeze({
      boundary: 'single-stylistic-channel',
      multiplicity: 'one-definition-many-unit-attachments',
    }),
    match: (ctx) => temporalMotifOccurrences(ctx, family),
  });
}

function infrastructureRule(id, channel) {
  return Object.freeze({
    id,
    kind: 'infrastructure-behaviour',
    atomicity: Object.freeze({ boundary: 'single-visual-channel' }),
    writes: Object.freeze([channel]),
    match: (ctx) => ctx.visualAtoms
      .filter((atom) => atom.channel === channel && atom.frameDriven)
      .map(atomOccurrence),
  });
}

/**
 * Atomic channels are part of the CBA mechanics vocabulary. They remain
 * separate so opacity + scale never turns into a combined Behaviour, but they
 * are deliberately excluded from the learned-memory candidate list.
 */
export const INFRASTRUCTURE_RULES = Object.freeze([
  infrastructureRule('motion.opacity', 'opacity'),
  infrastructureRule('motion.rotate', 'transform.rotate'),
  infrastructureRule('motion.scale', 'transform.scale'),
  infrastructureRule('motion.translate', 'transform.translate'),
]);

const AUTHORED_STYLE_PROPERTIES = new Set([
  'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius',
  'borderWidth', 'boxShadow', 'color', 'filter', 'fontFamily', 'fontSize',
  'fontStyle', 'fontWeight', 'letterSpacing', 'lineHeight', 'mixBlendMode',
  'textAlign', 'textShadow', 'textTransform', 'WebkitTextStroke',
]);

/**
 * Learned-memory discovery starts at a connected render-tree boundary. A
 * semantic label alone is insufficient: every match below must have nested
 * render structure, authored styling and content/media. Exact structural
 * variants are kept separate by the miner instead of being hidden behind an
 * open-ended appearance prop.
 */
export const RULES = Object.freeze([
  motifRule(
    'motif.ranking-card',
    'ranking-card',
    'A connected, styled ranking-card subtree with its own content hierarchy.',
    (ctx) => connectedFragmentOccurrences(ctx, (fragment) => (
      coherentStyledTree(fragment)
      && fragment.hasRankingSemantics
      && fragment.hasText
      && fragment.childElementCount >= 2
      && fragment.directStyleProperties.includes('position')
    )),
  ),
  motifRule(
    'motif.dialogue-card',
    'dialogue-card',
    'A connected dialogue-card subtree whose surface and text hierarchy form one motif.',
    (ctx) => {
      const surface = new Set(['background', 'backgroundColor', 'boxShadow', 'borderRadius']);
      return connectedFragmentOccurrences(ctx, (fragment) => (
        coherentStyledTree(fragment)
        && fragment.hasDialogueSemantics
        && fragment.hasText
        && fragment.directStyleProperties.some((name) => surface.has(name))
      ));
    },
  ),
  motifRule(
    'motif.timed-text-card',
    'timed-text-card',
    'A connected, styled timed-text subtree; the number of instances stays composition data.',
    (ctx) => connectedFragmentOccurrences(ctx, (fragment) => (
      coherentStyledTree(fragment)
      && fragment.hasTimedScatterSemantics
      && fragment.hasText
      && fragment.directStyleProperties.includes('position')
      && (fragment.directStyleProperties.includes('left')
        || fragment.directStyleProperties.includes('top'))
    )),
  ),
  temporalMotifRule(
    'motif.behaviour.authored-spring-law',
    'authored-spring-law',
    'A single-channel authored timing law identified by an explicit spring() driver.',
  ),
  temporalMotifRule(
    'motif.behaviour.oscillatory-law',
    'oscillatory-law',
    'A single-channel timing law identified by sine or cosine in its frame-driven closure.',
  ),
  temporalMotifRule(
    'motif.behaviour.staged-curve',
    'staged-curve',
    'A single-channel non-monotonic keyframe law with at least four authored points.',
  ),
]);

/** Return only authentic-memory motif occurrences. */
export function detectMatches(observation) {
  return detectWithRules(observation, RULES);
}

/** Return atomic mechanics evidence without turning it into memory entries. */
export function detectInfrastructureMatches(observation) {
  return detectWithRules(observation, INFRASTRUCTURE_RULES);
}

export function detectSignals(observation) {
  return uniqueIds(detectMatches(observation));
}

export function detectInfrastructureSignals(observation) {
  return uniqueIds(detectInfrastructureMatches(observation));
}

function detectWithRules(observation, rules) {
  const ctx = createContext(observation);
  const matches = [];
  for (const definition of rules) {
    try {
      for (const occurrence of definition.match(ctx) ?? []) {
        matches.push({
          id: definition.id,
          kind: definition.kind,
          ...(definition.family ? { family: definition.family } : {}),
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

function uniqueIds(matches) {
  return [...new Set(matches.map((match) => match.id))]
    .sort((left, right) => left.localeCompare(right));
}

function createContext(observation) {
  const code = observation?.code ?? {};
  return {
    source: stripRuntimeWrappers(String(observation?.private?.source ?? '')),
    visualAtoms: Array.isArray(code.visualAtoms) ? code.visualAtoms : [],
    visualFragments: Array.isArray(code.visualFragments) ? code.visualFragments : [],
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

function coherentStyledTree(fragment) {
  if (!validSpan(fragment.span)) return false;
  if (!['div', 'span', 'pre'].includes(fragment.rootKind)) return false;
  if (fragment.fullFrame) return false;
  if (fragment.childElementCount < 1) return false;
  if (!fragment.hasText && !fragment.containsMedia) return false;
  if ((fragment.subtreeStyleProperties ?? []).length < 3) return false;
  const authored = (fragment.subtreeStyleProperties ?? [])
    .filter((name) => AUTHORED_STYLE_PROPERTIES.has(name));
  const authoredAtRoot = (fragment.directStyleProperties ?? [])
    .filter((name) => AUTHORED_STYLE_PROPERTIES.has(name));
  if (authored.length < 2 || authoredAtRoot.length < 1) return false;
  if ((fragment.families ?? []).some((family) => ['canvas', 'svg', 'three'].includes(family))) {
    return false;
  }
  return true;
}

function connectedFragmentOccurrences(ctx, predicate) {
  const fragments = ctx.visualFragments
    .filter(predicate)
    .sort((left, right) => (
      spanLength(left.span) - spanLength(right.span)
      || left.span.start - right.span.start
      || left.fragmentId.localeCompare(right.fragmentId)
    ));
  const selected = [];

  // The smallest matching connected subtree owns the occurrence. Enclosing
  // scenes and cardinality wrappers therefore never become a separate class.
  for (const fragment of fragments) {
    if (selected.some((item) => containsSpan(fragment.span, item.span))) continue;
    selected.push(fragment);
  }

  return selected.map((fragment) => motifOccurrence(ctx, fragment));
}

function motifOccurrence(ctx, fragment) {
  const atoms = ctx.visualAtoms
    .filter((atom) => atom.frameDriven && containsSpan(fragment.span, atom.span));
  const channels = [...new Set(atoms
    .map((atom) => atom.channel))]
    .sort((left, right) => left.localeCompare(right));
  const styleShape = {
    structuralHash: fragment.structuralHash,
    rootKind: fragment.rootKind,
    directChildren: fragment.childElementCount,
    directStyleProperties: [...(fragment.directStyleProperties ?? [])].sort(),
    subtreeStyleProperties: [...(fragment.subtreeStyleProperties ?? [])].sort(),
    renderFamilies: [...(fragment.families ?? [])].sort(),
  };
  const fingerprint = styleFingerprint(ctx.source, fragment, atoms, styleShape);
  return {
    occurrenceKind: 'connected-styled-subtree',
    span: { ...fragment.span },
    dependencySpans: [],
    structuralHash: fragment.structuralHash,
    variantHash: fragment.structuralHash,
    styleFingerprintSha256: fingerprint.sha256,
    styleFingerprintProven: fingerprint.proven,
    identityFingerprintSha256: fingerprint.sha256,
    identityFingerprintProven: fingerprint.proven,
    rootKind: fragment.rootKind,
    renderFamilies: styleShape.renderFamilies,
    atomicChannels: channels,
    treeEvidence: {
      connected: true,
      directChildren: fragment.childElementCount,
      directStyleProperties: styleShape.directStyleProperties.length,
      subtreeStyleProperties: styleShape.subtreeStyleProperties.length,
    },
  };
}

function temporalMotifOccurrences(ctx, family) {
  return ctx.visualAtoms
    .filter((atom) => atom.frameDriven && temporalFamily(atom) === family)
    .map((atom) => temporalMotifOccurrence(ctx.source, atom, family));
}

function temporalFamily(atom) {
  const drivers = new Set(atom.drivers ?? []);
  if (drivers.has('spring')) return 'authored-spring-law';
  if (drivers.has('oscillation')) return 'oscillatory-law';
  if (drivers.has('keyframes') && (atom.shapes ?? []).some(isStagedNonLinearShape)) {
    return 'staged-curve';
  }
  return null;
}

function isStagedNonLinearShape(shape) {
  const match = /^(?:mixed|peak|valley):(\d+)$/u.exec(String(shape));
  return Boolean(match && Number(match[1]) >= 4);
}

function temporalMotifOccurrence(source, atom, family) {
  const expression = sourceSlice(source, atom.span);
  const dependencies = (atom.dependencySpans ?? [])
    .map((span) => sourceSlice(source, span))
    .filter(Boolean)
    .sort();
  const proven = validSpan(atom.span)
    && expression.length > 0
    && dependencies.length === (atom.dependencySpans ?? []).length;
  const fingerprint = sha256(stableStringify({
    family,
    channel: atom.channel,
    drivers: [...(atom.drivers ?? [])].sort(),
    shapes: [...(atom.shapes ?? [])].sort(),
    expression,
    dependencies,
  }));
  return {
    occurrenceKind: 'single-stylistic-channel-law',
    channel: atom.channel,
    writes: [atom.channel],
    span: { ...atom.span },
    dependencySpans: (atom.dependencySpans ?? []).map((span) => ({ ...span })),
    structuralHash: atom.variantHash,
    variantHash: atom.variantHash,
    temporalFingerprintSha256: fingerprint,
    temporalFingerprintProven: proven,
    identityFingerprintSha256: fingerprint,
    identityFingerprintProven: proven,
    atomicChannels: [atom.channel],
    temporalEvidence: {
      singleChannel: true,
      drivers: [...(atom.drivers ?? [])].sort(),
      shapes: [...(atom.shapes ?? [])].sort(),
    },
  };
}

/**
 * Preserve authored visual literals and temporal laws only in a one-way hash.
 * JSX text and media values live outside style attributes, so changing content
 * does not change the fingerprint. Exact style values never leave this scope.
 */
function styleFingerprint(source, fragment, atoms, treeShape) {
  const localSource = sourceSlice(source, fragment.span);
  const styles = [];
  let parsedTreeShape = null;
  let proven = localSource.length > 0;
  try {
    const expression = parseExpression(localSource, {
      plugins: ['jsx', 'typescript'],
    });
    parsedTreeShape = jsxTreeShape(expression);
    collectStyleExpressions(expression, styles, (value) => { proven &&= value; });
  } catch {
    proven = false;
  }
  if (styles.length === 0) proven = false;

  const temporalLaws = atoms.map((atom) => ({
    channel: atom.channel,
    expression: sourceSlice(source, atom.span),
    dependencies: (atom.dependencySpans ?? [])
      .map((span) => sourceSlice(source, span))
      .filter(Boolean)
      .sort(),
  })).sort((left, right) => left.channel.localeCompare(right.channel)
    || left.expression.localeCompare(right.expression));
  const preimage = {
    treeShape: parsedTreeShape ?? {
      rootKind: treeShape.rootKind,
      directChildren: treeShape.directChildren,
      directStyleProperties: treeShape.directStyleProperties,
      subtreeStyleProperties: treeShape.subtreeStyleProperties,
      renderFamilies: treeShape.renderFamilies,
    },
    styles,
    temporalLaws,
  };
  return { sha256: sha256(stableStringify(preimage)), proven };
}

function collectStyleExpressions(node, output, recordProof) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXAttribute' && jsxAttributeName(node.name) === 'style') {
    const expression = node.value?.type === 'JSXExpressionContainer'
      ? node.value.expression
      : node.value;
    if (!expression) {
      recordProof(false);
    } else {
      recordProof(expression.type === 'ObjectExpression');
      output.push(canonicalStyleAst(expression));
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'errors'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => collectStyleExpressions(entry, output, recordProof));
    else if (value && typeof value === 'object') collectStyleExpressions(value, output, recordProof);
  }
}

function jsxTreeShape(node) {
  if (node?.type === 'JSXElement') {
    const attributes = (node.openingElement?.attributes ?? [])
      .map((attribute) => {
        if (attribute.type === 'JSXSpreadAttribute') return '...';
        return jsxAttributeName(attribute.name) ?? 'computed';
      })
      .sort((left, right) => left.localeCompare(right));
    const children = (node.children ?? []).flatMap((child) => {
      if (child.type === 'JSXText') return child.value.trim() ? ['content'] : [];
      if (child.type === 'JSXExpressionContainer') {
        if (child.expression?.type === 'JSXEmptyExpression') return [];
        return ['content'];
      }
      const nested = jsxTreeShape(child);
      return nested ? [nested] : [];
    });
    return {
      kind: 'element',
      tag: jsxElementName(node.openingElement?.name),
      attributes,
      children,
    };
  }
  if (node?.type === 'JSXFragment') {
    return {
      kind: 'fragment',
      children: (node.children ?? []).flatMap((child) => {
        const nested = jsxTreeShape(child);
        if (nested) return [nested];
        if (child.type === 'JSXText' && child.value.trim()) return ['content'];
        if (child.type === 'JSXExpressionContainer') return ['content'];
        return [];
      }),
    };
  }
  return null;
}

function canonicalStyleAst(value) {
  const stripped = stripAstLocations(value);
  return sortObjectProperties(stripped);
}

function sortObjectProperties(value) {
  if (Array.isArray(value)) return value.map(sortObjectProperties);
  if (!value || typeof value !== 'object') return value;
  const output = Object.fromEntries(Object.entries(value)
    .map(([key, nested]) => [key, sortObjectProperties(nested)]));
  if (output.type === 'ObjectExpression' && Array.isArray(output.properties)) {
    output.properties.sort((left, right) => (
      astPropertyName(left).localeCompare(astPropertyName(right))
      || stableStringify(left).localeCompare(stableStringify(right))
    ));
  }
  return output;
}

function astPropertyName(node) {
  if (node?.type === 'SpreadElement') return '...';
  if (node?.key?.type === 'Identifier') return node.key.name;
  if (['StringLiteral', 'NumericLiteral'].includes(node?.key?.type)) {
    return String(node.key.value);
  }
  return 'computed';
}

function stripAstLocations(value) {
  if (Array.isArray(value)) return value.map(stripAstLocations);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'errors'].includes(key))
    .map(([key, nested]) => [key, stripAstLocations(nested)]));
}

function jsxAttributeName(node) {
  return node?.type === 'JSXIdentifier' ? node.name : null;
}

function jsxElementName(node) {
  if (node?.type === 'JSXIdentifier') return node.name;
  if (node?.type === 'JSXMemberExpression') {
    return `${jsxElementName(node.object)}.${jsxElementName(node.property)}`;
  }
  return 'computed';
}

function sourceSlice(source, span) {
  return Number.isInteger(span?.start) && Number.isInteger(span?.end)
    ? source.slice(span.start, span.end)
    : '';
}

function validSpan(span) {
  return Number.isInteger(span?.start)
    && Number.isInteger(span?.end)
    && span.start >= 0
    && span.end > span.start;
}

function spanLength(span) {
  return Math.max(0, Number(span?.end ?? 0) - Number(span?.start ?? 0));
}

function containsSpan(outer, inner) {
  return Number.isInteger(outer?.start)
    && Number.isInteger(outer?.end)
    && Number.isInteger(inner?.start)
    && Number.isInteger(inner?.end)
    && outer.start <= inner.start
    && outer.end >= inner.end;
}
