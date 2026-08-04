import * as t from '@babel/types';

const BINARY_OPERATORS = Object.freeze({
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
});
const CONTEXT_FIELDS = new Set([
  'frame', 'fps', 'width', 'height', 'durationInFrames',
]);
const PLACEHOLDER_START = '\u0001';
const PLACEHOLDER_END = '\u0002';
const NUMBER = '[+-]?(?:(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)';

/** Reject a locally shadowed built-in before lowering loses Babel bindings. */
export function hasTrustedSignalBindings(path) {
  if (!path?.node) return false;
  let trusted = true;
  const check = (candidate) => {
    if (!candidate.isReferencedIdentifier()
        || !['interpolate', 'Math', 'Easing'].includes(candidate.node.name)) return;
    const binding = candidate.scope.getBinding(candidate.node.name);
    if (!binding) return;
    if (candidate.node.name === 'Math' || binding.kind !== 'module') {
      trusted = false;
      return;
    }
    const declaration = binding.path.findParent((entry) => entry.isImportDeclaration());
    if (!/(?:^|\/)(?:remotion|@remotion\/[^/]+)$/u.test(declaration?.node.source.value ?? '')) {
      trusted = false;
    }
  };
  if (path.isIdentifier()) check(path);
  path.traverse({ Identifier: check });
  return trusted;
}

/** Lower only the closed, callback-free expression language supported by core Signals. */
export function lowerSignalFormula(expression) {
  try {
    return freezeIr(lowerNumeric(expression));
  } catch (error) {
    if (error instanceof UnsupportedSignalFormula) return null;
    throw error;
  }
}

/**
 * Split a CSS transform template at compile time and return the numeric/vector
 * signal for one already-validated atomic transform operation.
 */
export function lowerTransformSignal(expression, descriptor) {
  try {
    if (!t.isTemplateLiteral(expression)) throw new UnsupportedSignalFormula();
    const template = templateWithPlaceholders(expression);
    const operations = scanFunctions(template);
    const selected = operations[descriptor.operationIndex];
    if (!selected || selected.name !== descriptor.operation) throw new UnsupportedSignalFormula();
    const values = parseTransformValues(selected.body, expression.expressions);
    if (descriptor.kind === 'scale' && values.length === 1) return freezeIr(values[0].signal);
    if (descriptor.kind === 'rotate' && values.length === 1
        && compatibleUnit(values[0].unit, descriptor.unit, 'deg')) {
      return freezeIr(values[0].signal);
    }
    if (descriptor.kind !== 'translate' || values.length < 1 || values.length > 2
        || values.some(({ unit }) => !compatibleUnit(unit, descriptor.unit, 'px'))) {
      throw new UnsupportedSignalFormula();
    }
    if (descriptor.operation === 'translateX' && values.length === 1) {
      return freezeIr(record({ x: values[0].signal, y: literal(0) }));
    }
    if (descriptor.operation === 'translateY' && values.length === 1) {
      return freezeIr(record({ x: literal(0), y: values[0].signal }));
    }
    if (descriptor.operation === 'translate') {
      return freezeIr(record({
        x: values[0].signal,
        y: values[1]?.signal ?? literal(0),
      }));
    }
    throw new UnsupportedSignalFormula();
  } catch (error) {
    if (error instanceof UnsupportedSignalFormula) return null;
    throw error;
  }
}

export function signalIrClassNames(signal) {
  const names = new Set();
  visit(signal, (node) => {
    if (node.type === 'context') names.add('ContextValue');
    else if (node.type === 'computed') names.add('Computed');
    else if (node.type === 'interpolation') names.add('Interpolation');
    else if (node.type === 'record') names.add('RecordValue');
  });
  return Object.freeze([...names].sort());
}

function lowerNumeric(node) {
  if (t.isNumericLiteral(node)) return literal(node.value);
  if (t.isUnaryExpression(node, { operator: '-' })) {
    if (t.isNumericLiteral(node.argument)) return literal(-node.argument.value);
    return computed('multiply', [literal(-1), lowerNumeric(node.argument)]);
  }
  if (t.isUnaryExpression(node, { operator: '+' })) return lowerNumeric(node.argument);
  if (t.isMemberExpression(node) && !node.computed
      && t.isIdentifier(node.object, { name: 'context' })
      && t.isIdentifier(node.property) && CONTEXT_FIELDS.has(node.property.name)) {
    return { type: 'context', field: node.property.name };
  }
  if (t.isBinaryExpression(node) && Object.hasOwn(BINARY_OPERATORS, node.operator)) {
    return computed(BINARY_OPERATORS[node.operator], [
      lowerNumeric(node.left),
      lowerNumeric(node.right),
    ]);
  }
  if (!t.isCallExpression(node)) throw new UnsupportedSignalFormula();
  if (t.isIdentifier(node.callee, { name: 'interpolate' })) return lowerInterpolation(node);
  if (isMathCall(node, 'round') && node.arguments.length === 1) {
    return computed('round', [lowerNumeric(node.arguments[0])]);
  }
  if (isMathCall(node, 'max') && node.arguments.length > 0) {
    return computed('max', node.arguments.map(lowerArgument));
  }
  throw new UnsupportedSignalFormula();
}

function lowerInterpolation(node) {
  if (![3, 4].includes(node.arguments.length)) throw new UnsupportedSignalFormula();
  const inputRange = numericArray(node.arguments[1]);
  const outputRange = numericArray(node.arguments[2]);
  if (inputRange.length < 2 || inputRange.length !== outputRange.length) {
    throw new UnsupportedSignalFormula();
  }
  const options = interpolationOptions(node.arguments[3]);
  return {
    type: 'interpolation',
    input: lowerNumeric(node.arguments[0]),
    inputRange,
    outputRange,
    ...options,
  };
}

function interpolationOptions(node) {
  const output = {
    easing: 'linear',
    extrapolateLeft: 'extend',
    extrapolateRight: 'extend',
  };
  if (node === undefined) return output;
  if (!t.isObjectExpression(node)) throw new UnsupportedSignalFormula();
  const seen = new Set();
  for (const property of node.properties) {
    if (!t.isObjectProperty(property) || property.computed || property.shorthand) {
      throw new UnsupportedSignalFormula();
    }
    const name = t.isIdentifier(property.key) ? property.key.name
      : t.isStringLiteral(property.key) ? property.key.value : null;
    if (!name || seen.has(name)) throw new UnsupportedSignalFormula();
    seen.add(name);
    if (name === 'easing') output.easing = lowerEasing(property.value);
    else if (name === 'extrapolateLeft' || name === 'extrapolateRight') {
      if (!t.isStringLiteral(property.value)
          || !['clamp', 'extend'].includes(property.value.value)) {
        throw new UnsupportedSignalFormula();
      }
      output[name] = property.value.value;
    } else throw new UnsupportedSignalFormula();
  }
  return output;
}

function lowerEasing(node) {
  if (isEasingMember(node, 'linear')) return 'linear';
  if (isEasingMember(node, 'ease')) return 'ease';
  if (isEasingMember(node, 'quad')) return 'quad';
  if (isEasingMember(node, 'cubic')) return 'cubic';
  if (!t.isCallExpression(node) || !t.isMemberExpression(node.callee)
      || node.callee.computed || !t.isIdentifier(node.callee.object, { name: 'Easing' })
      || !t.isIdentifier(node.callee.property)) throw new UnsupportedSignalFormula();
  if (['in', 'out'].includes(node.callee.property.name) && node.arguments.length === 1) {
    return { name: node.callee.property.name, easing: lowerEasing(node.arguments[0]) };
  }
  if (node.callee.property.name === 'bezier' && node.arguments.length === 4
      && node.arguments.every((value) => t.isNumericLiteral(value))) {
    return { name: 'bezier', values: node.arguments.map((value) => value.value) };
  }
  throw new UnsupportedSignalFormula();
}

function numericArray(node) {
  if (!t.isArrayExpression(node) || node.elements.some((value) => !value || t.isSpreadElement(value))) {
    throw new UnsupportedSignalFormula();
  }
  return node.elements.map(lowerNumeric);
}

function lowerArgument(node) {
  if (t.isSpreadElement(node) || t.isArgumentPlaceholder(node)) throw new UnsupportedSignalFormula();
  return lowerNumeric(node);
}

function isMathCall(node, name) {
  return t.isMemberExpression(node.callee) && !node.callee.computed
    && t.isIdentifier(node.callee.object, { name: 'Math' })
    && t.isIdentifier(node.callee.property, { name });
}

function isEasingMember(node, name) {
  return t.isMemberExpression(node) && !node.computed
    && t.isIdentifier(node.object, { name: 'Easing' })
    && t.isIdentifier(node.property, { name });
}

function templateWithPlaceholders(node) {
  if (node.quasis.some((quasi) => {
    const value = quasi.value.cooked ?? quasi.value.raw;
    return value.includes(PLACEHOLDER_START) || value.includes(PLACEHOLDER_END);
  })) throw new UnsupportedSignalFormula();
  let output = node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? '';
  node.expressions.forEach((_expression, index) => {
    output += `${PLACEHOLDER_START}${index}${PLACEHOLDER_END}`;
    output += node.quasis[index + 1]?.value.cooked ?? node.quasis[index + 1]?.value.raw ?? '';
  });
  return output;
}

function parseTransformValues(body, expressions) {
  const pattern = new RegExp(
    `(?:${PLACEHOLDER_START}(\\d+)${PLACEHOLDER_END}|(${NUMBER}))\\s*([A-Za-z%]+)?`,
    'gy',
  );
  const output = [];
  let cursor = 0;
  while (cursor < body.length) {
    const separator = body.slice(cursor).match(/^\s*(?:,\s*|\s+)/u);
    if (separator) cursor += separator[0].length;
    pattern.lastIndex = cursor;
    const match = pattern.exec(body);
    if (!match) throw new UnsupportedSignalFormula();
    const expressionIndex = match[1] === undefined ? null : Number(match[1]);
    const signal = expressionIndex === null
      ? literal(Number(match[2]))
      : lowerNumeric(expressions[expressionIndex]);
    output.push({ signal, unit: match[3] ?? null });
    cursor = pattern.lastIndex;
  }
  if (output.length === 0) throw new UnsupportedSignalFormula();
  return output;
}

function compatibleUnit(actual, expected, fallback) {
  return (actual ?? fallback) === (expected ?? fallback);
}

function scanFunctions(value) {
  const output = [];
  let cursor = 0;
  while (cursor < value.length) {
    const match = /([A-Za-z][\w-]*)\s*\(/gu;
    match.lastIndex = cursor;
    const found = match.exec(value);
    if (!found) break;
    let depth = 1;
    let end = match.lastIndex;
    while (end < value.length && depth > 0) {
      if (value[end] === '(') depth += 1;
      else if (value[end] === ')') depth -= 1;
      end += 1;
    }
    if (depth !== 0) throw new UnsupportedSignalFormula();
    output.push({ name: found[1], body: value.slice(match.lastIndex, end - 1) });
    cursor = end;
  }
  return output;
}

function literal(value) { return { type: 'literal', value }; }
function computed(operator, operands) { return { type: 'computed', operator, operands }; }
function record(fields) { return { type: 'record', fields }; }

function visit(node, visitor) {
  visitor(node);
  if (node.type === 'computed') node.operands.forEach((value) => visit(value, visitor));
  else if (node.type === 'interpolation') {
    visit(node.input, visitor);
    node.inputRange.forEach((value) => visit(value, visitor));
    node.outputRange.forEach((value) => visit(value, visitor));
  } else if (node.type === 'record') Object.values(node.fields).forEach((value) => visit(value, visitor));
}

function freezeIr(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeIr);
  return Object.freeze(value);
}

class UnsupportedSignalFormula extends Error {}
