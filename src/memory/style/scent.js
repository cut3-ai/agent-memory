import {
  deepFreeze,
  literalString,
  literalTokenArray,
  propertyName,
  unique,
  unwrapFreeze,
} from './ast.js';
import {
  isStyleFamily,
  isStyleScentToken,
  STYLE_SCENT_KEYS,
} from '../scent-schema.js';

export { STYLE_SCENT_KEYS } from '../scent-schema.js';

/** Read the exact controlled vocabulary embedded in `static scent`. */
export function readStyleScent(classNode, type = null) {
  const violations = [];
  const member = classNode?.body?.body?.find((entry) => (
    entry.static
      && ['ClassProperty', 'PropertyDefinition'].includes(entry.type)
      && propertyName(entry.key) === 'scent'
  ));
  if (!member) return { scent: null, violations: ['style-scent-missing'] };
  const node = unwrapFreeze(member.value);
  if (node?.type !== 'ObjectExpression') {
    return { scent: null, violations: ['style-scent-not-literal'] };
  }
  const raw = new Map();
  for (const property of node.properties) {
    if (property.type !== 'ObjectProperty' || property.computed) {
      violations.push('style-scent-not-literal');
      continue;
    }
    const key = propertyName(property.key);
    if (!key || raw.has(key)) {
      violations.push('style-scent-duplicate-key');
      continue;
    }
    raw.set(key, property.value);
  }
  if (raw.size !== STYLE_SCENT_KEYS.length
      || STYLE_SCENT_KEYS.some((key) => !raw.has(key))
      || [...raw.keys()].some((key) => !STYLE_SCENT_KEYS.includes(key))) {
    violations.push('style-scent-shape');
  }

  const family = literalString(raw.get('family'));
  if (!isStyleFamily(family)) violations.push('style-scent-family');
  const scent = { family };
  for (const axis of STYLE_SCENT_KEYS.slice(1)) {
    const values = literalTokenArray(raw.get(axis));
    if (!values || values.length > 8) {
      violations.push(`style-scent-${axis}`);
      scent[axis] = values ?? [];
      continue;
    }
    if (new Set(values).size !== values.length
        || values.some((value) => !isStyleScentToken(value))) {
      violations.push(`style-scent-${axis}`);
    }
    if (type === 'unit' && values.length === 0) violations.push(`style-scent-${axis}`);
    if (type === 'behaviour') {
      if (axis === 'motion' && values.length === 0) violations.push('style-scent-motion');
      if (axis !== 'motion' && values.length > 0) {
        violations.push(`behaviour-scent-${axis}-must-be-empty`);
      }
    }
    scent[axis] = [...values].sort();
  }
  return {
    scent: deepFreeze(scent),
    violations: unique(violations),
  };
}
