import { sha256, stableStringify } from '../../lib.js';
import { isStyleFamily, isStyleScentToken } from '../scent-schema.js';
import { normalizeVectorPathSegments } from '../../../core/vector-path.js';

export const STYLE_EVIDENCE_VERSION = 1;

const AXES = Object.freeze([
  'composition',
  'typography',
  'palette',
  'rendering',
  'motion',
]);
const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const GENERIC_NO_OP = new Set([
  '',
  'auto',
  'currentcolor',
  'default',
  'inherit',
  'initial',
  'none',
  'normal',
  'revert',
  'revert-layer',
  'transparent',
  'unset',
]);
const PROPERTY_NO_OP = Object.freeze({
  alignContent: new Set(['normal', 'stretch']),
  alignItems: new Set(['normal', 'stretch']),
  alignSelf: new Set(['auto', 'normal', 'stretch']),
  background: new Set(['none', 'transparent']),
  backgroundColor: new Set(['transparent']),
  backgroundImage: new Set(['none']),
  border: new Set(['none']),
  borderColor: new Set(['currentcolor', 'transparent']),
  borderRadius: new Set(['0']),
  boxShadow: new Set(['none']),
  color: new Set(['currentcolor', 'transparent']),
  display: new Set(['block', 'inline']),
  fill: new Set(['black', 'none', 'currentcolor', 'transparent']),
  filter: new Set(['none']),
  fontFeatureSettings: new Set(['normal']),
  fontSize: new Set(['medium']),
  fontStretch: new Set(['normal']),
  fontStyle: new Set(['normal']),
  fontVariant: new Set(['normal']),
  fontWeight: new Set(['normal', '400']),
  letterSpacing: new Set(['normal']),
  lineHeight: new Set(['normal']),
  mask: new Set(['none']),
  mixBlendMode: new Set(['normal']),
  outline: new Set(['none']),
  outlineColor: new Set(['invert', 'currentcolor', 'transparent']),
  overflow: new Set(['visible']),
  position: new Set(['static']),
  stroke: new Set(['none', 'currentcolor', 'transparent']),
  textAlign: new Set(['start']),
  textDecoration: new Set(['none']),
  textShadow: new Set(['none']),
  textTransform: new Set(['none']),
  width: new Set(['auto']),
  wordSpacing: new Set(['normal']),
  zIndex: new Set(['auto']),
});
const ZERO_CSS = /^[+-]?0(?:\.0+)?(?:%|ch|cm|em|ex|in|mm|pc|pt|px|rem|vh|vmax|vmin|vw)?$/u;
const TRANSPARENT_HEX = /^(?:#[a-f0-9]{3}0|#[a-f0-9]{6}00)$/iu;
const TRANSPARENT_FUNCTION = /^(?:hsla?|rgba?)\([^)]*(?:[,/]\s*0(?:\.0+)?%?\s*)\)$/iu;
const GENERIC_EVIDENCE_DESCRIPTOR = /^(?:authored-frame-law|channel-|uses-)/u;

/** Return a canonical meaningful literal, or null when it is default/no-op evidence. */
export function meaningfulStyleDecision(axis, key, node) {
  const value = literalValue(node);
  if (value === UNREADABLE || !meaningfulValue(value, axis, key)) return null;
  return Object.freeze({
    axis,
    key,
    value,
    canonical: stableStringify(value),
  });
}

/** Return one canonical authored geometry decision, or null for open/invalid input. */
export function vectorPathStyleDecision(node) {
  const value = literalValue(node);
  if (value === UNREADABLE) return null;
  try {
    const normalized = normalizeVectorPathSegments(value);
    const segments = normalized.segments.map(({ command, values }) => ({
      command,
      values: [...values],
    }));
    return Object.freeze({
      axis: 'rendering',
      key: 'vectorPath',
      value: segments,
      canonical: stableStringify(segments),
    });
  } catch {
    return null;
  }
}

export function buildUnitStyleEvidence({
  decisions,
  internalUnitNodes,
  treeDepth,
  branched,
  treeSignature,
  motionDescriptors = [],
  motionFingerprints = [],
}) {
  const descriptors = descriptorSets();
  const byAxis = Object.fromEntries(AXES.map((axis) => [axis, []]));
  for (const decision of decisions) {
    byAxis[decision.axis].push(decision);
    descriptors[decision.axis].add(`uses-${toToken(decision.key)}`);
  }

  if (branched) descriptors.composition.add('branched-tree');
  if (treeDepth >= 4) descriptors.composition.add('deep-tree');
  if (internalUnitNodes >= 5) descriptors.composition.add('layered-composition');
  deriveComposition(byAxis.composition, descriptors.composition, branched);
  deriveTypography(byAxis.typography, descriptors.typography);
  derivePalette(byAxis.palette, descriptors.palette);
  deriveRendering(byAxis.rendering, descriptors.rendering);
  motionDescriptors.forEach((descriptor) => addDescriptor(descriptors.motion, descriptor));

  return evidence({
    type: 'unit',
    descriptors,
    signature: {
      decisions: decisions.map(({ axis, key, canonical, unitIndex }) => ({
        axis, key, unitIndex, value: canonical,
      }))
        .sort(compareDecision),
      structure: { branched, internalUnitNodes, treeDepth, tree: treeSignature },
      motionFingerprints: [...new Set(motionFingerprints)].sort(),
    },
  });
}

export function buildBehaviourStyleEvidence({ channel, closure }) {
  const descriptors = descriptorSets();
  const signatures = [];
  let conditional = false;
  let powered = false;
  let periodic = false;
  let overshoot = false;
  for (const node of closure) {
    if (node.type === 'ConditionalExpression') {
      conditional = true;
      signatures.push('conditional');
    } else if (node.type === 'BinaryExpression') {
      signatures.push(`binary:${node.operator}`);
      if (node.operator === '**') powered = true;
      if (node.operator === '%') periodic = true;
    } else if (node.type === 'LogicalExpression') {
      signatures.push(`logical:${node.operator}`);
    } else if (node.type === 'UnaryExpression') {
      signatures.push(`unary:${node.operator}`);
    } else if (node.type === 'NumericLiteral') {
      signatures.push(`number:${node.value}`);
      if (node.value > 1 && node.value < 2) overshoot = true;
    } else if (node.type === 'CallExpression'
        && node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'Identifier'
        && node.callee.object.name === 'Math') {
      const method = propertyName(node.callee.property);
      signatures.push(`math:${method}`);
      if (method === 'pow') powered = true;
      if (['cos', 'sin', 'tan'].includes(method)) periodic = true;
    }
  }
  addDescriptor(descriptors.motion, `channel-${String(channel).replace(':', '-')}`);
  descriptors.motion.add('authored-frame-law');
  if (conditional) descriptors.motion.add('piecewise-motion');
  if (powered) descriptors.motion.add('eased-curve');
  if (periodic) descriptors.motion.add('periodic-motion');
  if (overshoot) descriptors.motion.add('overshoot-motion');
  if (conditional && powered && overshoot) descriptors.motion.add('two-beat-snap');
  if (conditional && ['opacity', 'visible'].includes(channel)) descriptors.motion.add('hard-cut');

  return evidence({
    type: 'behaviour',
    descriptors,
    signature: {
      channel,
      law: signatures,
    },
  });
}

/** Validate semantic cue support and bind the accepted scent to derived evidence. */
export function bindScentEvidence(scent, type, rawEvidence) {
  if (!rawEvidence || !scent) return { evidence: rawEvidence ?? null, violations: [] };
  const violations = [];
  for (const axis of AXES) {
    const cues = scent[axis] ?? [];
    if (type === 'behaviour' && axis !== 'motion') {
      if (cues.length > 0) violations.push(`behaviour-scent-${axis}-must-be-empty`);
      continue;
    }
    if (cues.length === 0) {
      violations.push(`style-scent-${axis}-evidence-missing`);
      continue;
    }
    for (const cue of cues) {
      if (!rawEvidence.descriptors[axis].some((descriptor) => cueMatches(cue, descriptor))) {
        violations.push(`style-scent-${axis}-unsupported`);
      }
    }
  }
  const cueBody = {
    version: STYLE_EVIDENCE_VERSION,
    fingerprintSha256: rawEvidence.fingerprintSha256,
    family: scent.family,
    cues: Object.fromEntries(AXES.map((axis) => [axis, [...(scent[axis] ?? [])].sort()])),
  };
  return {
    evidence: Object.freeze({
      ...rawEvidence,
      cueEvidenceSha256: sha256(stableStringify(cueBody)),
    }),
    violations,
  };
}

export function verifyCueEvidence(scent, evidenceValue) {
  if (!validEvidenceShape(evidenceValue) || !validScentShape(scent)) return false;
  const rebound = bindScentEvidence(scent, evidenceValue.type, evidenceValue);
  if (rebound.violations.length > 0) return false;
  const cueBody = {
    version: STYLE_EVIDENCE_VERSION,
    fingerprintSha256: evidenceValue.fingerprintSha256,
    family: scent.family,
    cues: Object.fromEntries(AXES.map((axis) => [axis, [...(scent[axis] ?? [])].sort()])),
  };
  return sha256(stableStringify(cueBody)) === evidenceValue.cueEvidenceSha256;
}

function validEvidenceShape(value) {
  return value?.version === STYLE_EVIDENCE_VERSION
    && ['unit', 'behaviour'].includes(value.type)
    && /^[a-f0-9]{64}$/u.test(value.fingerprintSha256 ?? '')
    && /^[a-f0-9]{64}$/u.test(value.cueEvidenceSha256 ?? '')
    && value.descriptors
    && AXES.every((axis) => Array.isArray(value.descriptors[axis])
      && value.descriptors[axis].every((descriptor) => TOKEN.test(descriptor)));
}

function validScentShape(value) {
  return value && isStyleFamily(value.family)
    && AXES.every((axis) => Array.isArray(value[axis])
      && value[axis].every((cue) => isStyleScentToken(cue)));
}

function evidence({ type, descriptors, signature }) {
  const normalizedDescriptors = Object.fromEntries(AXES.map((axis) => [
    axis,
    [...descriptors[axis]].sort(),
  ]));
  const fingerprintSha256 = sha256(stableStringify({
    version: STYLE_EVIDENCE_VERSION,
    type,
    descriptors: normalizedDescriptors,
    signature,
  }));
  return Object.freeze({
    version: STYLE_EVIDENCE_VERSION,
    type,
    fingerprintSha256,
    descriptors: deepFreeze(normalizedDescriptors),
  });
}

function deriveComposition(decisions, output, branched) {
  const values = decisionMap(decisions);
  const position = normalizedString(values.get('position'));
  const anchored = ['bottom', 'left', 'right', 'top'].some((key) => values.has(key));
  if (position === 'absolute') output.add('absolute-layout');
  if (position === 'absolute' && anchored) output.add('edge-anchored');
  if (branched && position === 'absolute' && anchored) output.add('asymmetric-stack');
  if (normalizedString(values.get('display')) === 'flex') output.add('flex-layout');
  if (normalizedString(values.get('display')) === 'grid') output.add('grid-layout');
}

function deriveTypography(decisions, output) {
  const values = decisionMap(decisions);
  const family = normalizedString(values.get('fontFamily'));
  const transform = normalizedString(values.get('textTransform'));
  const size = cssNumber(values.get('fontSize'));
  const weight = cssNumber(values.get('fontWeight'));
  const leading = cssNumber(values.get('lineHeight'));
  if (family.includes('condensed')) output.add('condensed-type');
  if (transform === 'uppercase') output.add('uppercase-type');
  if (family.includes('condensed') && transform === 'uppercase') output.add('condensed-uppercase');
  if (size !== null && size >= 48) output.add('oversized-copy');
  if (weight !== null && weight >= 700) output.add('heavy-copy');
  if (leading !== null && leading > 0 && leading <= 1.1) output.add('tight-leading');
  for (const font of fontFamilies(family)) addDescriptor(output, `font-${font}`);
}

function derivePalette(decisions, output) {
  const hexes = decisions.flatMap(({ value }) => extractColorHexes(value));
  const colors = hexes.map(hexToRgb);
  if (colors.length >= 2) output.add('multi-tone-palette');
  hexes.forEach((hex) => output.add(`color-${hex}`));
  for (const [red, green, blue] of colors) {
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (luminance <= 48) output.add('ink-black');
    if (luminance >= 220) output.add('paper-white');
    if (red >= 180 && red >= green * 1.45 && red >= blue * 1.35) output.add('signal-red');
  }
}

function deriveRendering(decisions, output) {
  for (const { key, value } of decisions) {
    const text = normalizedString(value);
    if (key === 'vectorPath') {
      const commands = new Set(value.map(({ command }) => command));
      output.add('authored-vector-drawing');
      output.add(`vector-geometry-${sha256(stableStringify(value)).slice(0, 12)}`);
      if ([...commands].some((command) => ['L', 'H', 'V'].includes(command))) {
        output.add('angular-linework');
      }
      if ([...commands].some((command) => ['A', 'C', 'Q', 'S', 'T'].includes(command))) {
        output.add('curved-linework');
      }
      if (commands.has('Z')) output.add('closed-vector-shape');
      if (value.length >= 4) output.add('multi-segment-path');
    }
    if (key === 'strokeWidth' && typeof value === 'number') {
      output.add('weighted-stroke');
      addDescriptor(output, `stroke-width-${numericToken(value)}`);
      if (value <= 2) output.add('fine-stroke');
      if (value >= 6) output.add('bold-stroke');
    }
    if (key === 'strokeDasharray') output.add('dashed-stroke');
    if (key === 'roundCaps' || key === 'roundJoins') output.add('rounded-stroke');
    if (key === 'nonScalingStroke') output.add('non-scaling-stroke');
    if (key === 'border' || key === 'outline') output.add('outlined-edge');
    if ((key === 'border' || key === 'outline') && /(?:^|\s)[4-9]\d*px\s+solid\b/u.test(text)) {
      output.add('dry-marker-outline');
    }
    if (['boxShadow', 'textShadow'].includes(key)) {
      output.add('shadowed-surface');
      if (/^-?\d+(?:\.\d+)?px\s+-?\d+(?:\.\d+)?px\s+0(?:px)?\b/u.test(text)) {
        output.add('hard-shadow');
      }
    }
    if (key === 'backgroundImage' && /gradient\(/u.test(text)) output.add('patterned-surface');
    if (key === 'backgroundImage' && /radial-gradient\(/u.test(text)
        && /0?\.\d+px/u.test(text)) output.add('paper-grain');
    if (key === 'borderRadius') output.add('rounded-shape');
    if (['clipPath', 'mask'].includes(key)) output.add('clipped-shape');
    if (['backdropFilter', 'filter'].includes(key)) output.add('filtered-rendering');
  }
}

function meaningfulValue(value, axis, key) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      && value !== 0
      && !PROPERTY_NO_OP[key]?.has(String(value));
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/\s+/gu, ' ');
    if (GENERIC_NO_OP.has(normalized) || ZERO_CSS.test(normalized)) return false;
    if (PROPERTY_NO_OP[key]?.has(normalized)) return false;
    if (['palette', 'rendering'].includes(axis)
        && (TRANSPARENT_HEX.test(normalized) || TRANSPARENT_FUNCTION.test(normalized))) return false;
    if (['border', 'outline'].includes(key)
        && borderIsNoOp(normalized)) return false;
    if (['boxShadow', 'textShadow'].includes(key) && shadowIsNoOp(normalized)) return false;
    return true;
  }
  if (Array.isArray(value)) return value.some((entry) => meaningfulValue(entry, axis, key));
  if (value && typeof value === 'object') {
    return Object.values(value).some((entry) => meaningfulValue(entry, axis, key));
  }
  return false;
}

function shadowIsNoOp(value) {
  if (value === 'none' || /\btransparent\b/u.test(value)) return true;
  const numeric = [...value.matchAll(/-?\d+(?:\.\d+)?(?:px|rem|em)?/gu)]
    .map((match) => Number.parseFloat(match[0]));
  return numeric.length >= 2 && numeric.every((number) => number === 0);
}

function borderIsNoOp(value) {
  if (/\b(?:hidden|none|transparent)\b/u.test(value)) return true;
  const withoutFunctions = value.replace(/[a-z-]+\([^)]*\)/giu, ' ');
  return /(?:^|\s)[+-]?0(?:\.0+)?(?:%|ch|cm|em|ex|in|mm|pc|pt|px|rem)?(?=\s|$)/u
    .test(withoutFunctions);
}

const UNREADABLE = Symbol('unreadable-style-literal');

function literalValue(node) {
  if (!node) return UNREADABLE;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral'
      || node.type === 'BooleanLiteral') return node.value;
  if (node.type === 'UnaryExpression' && ['+', '-'].includes(node.operator)) {
    const nested = literalValue(node.argument);
    return typeof nested === 'number' ? (node.operator === '-' ? -nested : nested) : UNREADABLE;
  }
  if (node.type === 'ArrayExpression') {
    const values = node.elements.map(literalValue);
    return values.includes(UNREADABLE) ? UNREADABLE : values;
  }
  if (node.type === 'ObjectExpression') {
    const result = {};
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed) return UNREADABLE;
      const key = propertyName(property.key);
      const value = literalValue(property.value);
      if (!key || Object.hasOwn(result, key) || value === UNREADABLE) return UNREADABLE;
      result[key] = value;
    }
    return result;
  }
  return UNREADABLE;
}

function cueMatches(cue, descriptor) {
  return !GENERIC_EVIDENCE_DESCRIPTOR.test(cue) && cue === descriptor;
}

function descriptorSets() {
  return Object.fromEntries(AXES.map((axis) => [axis, new Set()]));
}

function addDescriptor(output, value) {
  const token = toToken(value);
  if (TOKEN.test(token) && token.length <= 64) output.add(token);
}

function toToken(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function decisionMap(decisions) {
  return new Map(decisions.map(({ key, value }) => [key, value]));
}

function cssNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedString(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/gu, ' ') : '';
}

function extractColorHexes(value) {
  if (typeof value !== 'string') return [];
  const colors = new Set();
  for (const match of value.matchAll(/#([a-f0-9]{8}|[a-f0-9]{6}|[a-f0-9]{4}|[a-f0-9]{3})(?![a-f0-9])/giu)) {
    const hex = [3, 4].includes(match[1].length)
      ? [...match[1]].map((digit) => `${digit}${digit}`).join('')
      : match[1].toLowerCase();
    colors.add(hex);
  }
  return [...colors].sort();
}

function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function fontFamilies(value) {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').map((family) => family.trim()
    .replace(/^(['"])(.*)\1$/u, '$2')
    .toLowerCase())
    .filter((family) => /^[a-z0-9]+(?:[ -][a-z0-9]+){0,3}$/u.test(family))
    .map(toToken);
}

function numericToken(value) {
  return String(value).replace('-', 'minus-').replace('.', '-point-');
}

function propertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'StringLiteral') return node.value;
  return null;
}

function compareDecision(left, right) {
  return left.unitIndex - right.unitIndex
    || left.axis.localeCompare(right.axis)
    || left.key.localeCompare(right.key)
    || left.value.localeCompare(right.value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
