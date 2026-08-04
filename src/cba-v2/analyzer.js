import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

import { normalizeCbaV2Features } from './features.js';

const traverse = traverseModule.default ?? traverseModule;
const ENTRY_NAMES = ['GeneratedComposition', 'Composition', 'VideoComposition', 'Root'];
const VISUAL_CLASSES = Object.freeze({ opacity: 'Opacity' });

/** Find class Units and only visual properties with a provable frame dependency. */
export function analyzeComposition(ast, featureInput = undefined) {
  const features = normalizeCbaV2Features(featureInput);
  const targets = new Map();
  const warnings = [];
  const units = [];
  const behaviours = [];
  let entryName = null;
  traverse(ast, {
    Program(path) { entryName = findEntryName(path); },
    CallExpression(path) {
      if (!isElementCall(path.node)) return;
      const descriptor = analyzeElement(path, warnings, features);
      const key = sourceKey(path.node);
      descriptor.behaviours.forEach((behaviour) => {
        if (behaviour.implementation !== 'local') return;
        behaviour.className = `Local${capitalise(behaviour.kind)}Behaviour${behaviours.length}`;
      });
      targets.set(key, descriptor);
      units.push({ key, className: 'NativeUnit', tag: describeType(path.node.arguments[0]) });
      descriptor.behaviours.forEach(({ formula, ...behaviour }) => behaviours.push({
        key,
        ...behaviour,
        ...(formula ? { formulaMode: formula.mode, captures: formula.captures } : {}),
      }));
    },
  });
  if (!entryName) throw new TypeError('No composition entry function was found');
  return {
    entryName,
    targets,
    warnings: Object.freeze([...new Set(warnings)]),
    inventory: {
      units: Object.freeze(units.map(Object.freeze)),
      behaviours: Object.freeze(behaviours.map(Object.freeze)),
    },
  };
}

export function sourceKey(node) {
  const start = node.loc?.start;
  const end = node.loc?.end;
  if (start && end) return `${start.line}:${start.column}-${end.line}:${end.column}`;
  return `${node.start ?? -1}:${node.end ?? -1}`;
}

function findEntryName(programPath) {
  for (const name of ENTRY_NAMES) if (programPath.scope.hasBinding(name)) return name;
  for (const statement of programPath.node.body) {
    if (!t.isExportDefaultDeclaration(statement)) continue;
    if (t.isIdentifier(statement.declaration)) return statement.declaration.name;
    if (t.isFunctionDeclaration(statement.declaration) && statement.declaration.id) {
      return statement.declaration.id.name;
    }
  }
  return null;
}

function analyzeElement(callPath, warnings, features) {
  const propsPath = callPath.get('arguments.1');
  const stylePath = findStylePath(propsPath);
  const result = { behaviours: [], stripStyleKeys: [] };
  if (!stylePath) return result;

  const opacityPath = findObjectPropertyValue(stylePath, 'opacity');
  if (opacityPath && frameDependent(opacityPath)) {
    const signal = recogniseTween(opacityPath);
    const useTween = Boolean(signal && features.opacityTween);
    const useFormula = !useTween && features.opacityFormula;
    const formula = useFormula ? contextualFormula(opacityPath) : null;
    if (useTween || (useFormula && formula.mode === 'frame-context')) {
      result.behaviours.push({
        kind: 'opacity',
        className: useTween ? VISUAL_CLASSES.opacity : 'LocalOpacityBehaviour',
        implementation: useTween ? 'library' : 'local',
        signal: useTween ? signal : null,
        formula,
      });
      result.stripStyleKeys.push('opacity');
    } else if (useFormula) {
      warnings.push('A frame-dependent opacity stayed native because its formula captures executable local code.');
    }
  }

  const transformPath = findObjectPropertyValue(stylePath, 'transform');
  if (transformPath && frameDependent(transformPath)) {
    const operations = transformOperations(transformPath);
    const supported = operations.length > 0
      && operations.every((operation) => operation.kind)
      && new Set(operations.map((operation) => operation.kind)).size === operations.length;
    const anyTransformFeature = features.scaleFormula || features.translateFormula || features.rotateFormula;
    if (supported && anyTransformFeature) {
      const formula = contextualFormula(transformPath);
      if (formula.mode === 'frame-context') {
        const promoted = operations.flatMap((operation, index) => (
          features[`${operation.kind}Formula`] ? [{ operation, index }] : []
        ));
        promoted.forEach(({ operation, index }) => result.behaviours.push({
          kind: operation.kind,
          className: `Local${capitalise(operation.kind)}Behaviour`,
          implementation: 'local',
          operation: operation.name,
          operationIndex: index,
          unit: operation.unit,
          formula,
        }));
        if (promoted.length > 0) {
          result.stripStyleKeys.push('transform');
          result.transformOperationCount = operations.length;
          result.promotedTransformIndexes = promoted.map(({ index }) => index);
        }
      } else warnings.push('A frame-dependent transform stayed native because its formula captures executable local code.');
    } else if (!supported && anyTransformFeature) {
      warnings.push('A frame-dependent transform stayed native because its operations were not losslessly separable.');
    }
  }
  return result;
}

function contextualFormula(path) {
  const captures = new Set();
  const state = {
    captures,
    localRanges: nodeRange(path.node) ? [nodeRange(path.node)] : [],
    unsupported: false,
  };
  const expression = cloneFormula(path, state, new Set());
  return {
    expression,
    captures: Object.freeze([...captures].sort()),
    mode: state.unsupported ? 'captured-value' : 'frame-context',
  };
}

function cloneFormula(path, state, seenBindings) {
  if (!path?.node) return t.identifier('undefined');
  if (path.isCallExpression() && isHookPath(path, 'useCurrentFrame')) {
    return t.memberExpression(t.identifier('context'), t.identifier('frame'));
  }
  if (path.isCallExpression() && isHookPath(path, 'useVideoConfig')) return t.identifier('context');
  if (path.isIdentifier() && path.isReferencedIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding) return t.cloneNode(path.node);
    if (bindingIsLocalToFormula(binding, state)) return t.cloneNode(path.node);
    if (binding.path.isVariableDeclarator() && binding.constant && !seenBindings.has(binding)) {
      const destructured = cloneDestructuredBinding(binding, path.node.name, state, seenBindings);
      if (destructured) return destructured;
      const init = binding.path.get('init');
      if (init?.node) {
        return cloneFormula(init, withLocalRange(state, init.node), new Set(seenBindings).add(binding));
      }
    }
    if (binding.kind === 'module' || binding.path.parentPath?.isProgram()) return t.cloneNode(path.node);
    if (binding.path.isFunctionDeclaration() || binding.path.isFunctionExpression()) {
      state.unsupported = true;
      return t.cloneNode(path.node);
    }
    if ((path.parentPath?.isCallExpression() && path.key === 'callee')
        || (path.parentPath?.isMemberExpression() && path.key === 'object'
          && path.parentPath.parentPath?.isCallExpression()
          && path.parentPath.key === 'callee')) state.unsupported = true;
    state.captures.add(path.node.name);
    return t.memberExpression(t.memberExpression(t.thisExpression(), t.identifier('values')), t.identifier(path.node.name));
  }
  const output = t.cloneNode(path.node, false);
  for (const key of t.VISITOR_KEYS[path.node.type] ?? []) {
    const child = path.get(key);
    if (Array.isArray(child)) output[key] = child.map((nested) => cloneFormula(nested, state, seenBindings));
    else if (child?.node) output[key] = cloneFormula(child, state, seenBindings);
  }
  if (t.isObjectProperty(output) && output.shorthand && !t.isIdentifier(output.value)) output.shorthand = false;
  return output;
}

function cloneDestructuredBinding(binding, localName, state, seenBindings) {
  const declarator = binding.path.isVariableDeclarator()
    ? binding.path
    : binding.path.findParent((entry) => entry.isVariableDeclarator());
  const init = declarator?.get('init');
  const pattern = declarator?.get('id');
  if (!init?.node || !pattern?.node) return null;
  const nextSeen = new Set(seenBindings).add(binding);
  if (pattern.isObjectPattern()) {
    for (const property of pattern.get('properties')) {
      if (!property.isObjectProperty()) continue;
      const value = property.get('value');
      const target = value.isAssignmentPattern() ? value.get('left') : value;
      if (!target.isIdentifier({ name: localName })) continue;
      const object = cloneFormula(init, withLocalRange(state, init.node), nextSeen);
      const key = property.get('key');
      const computed = property.node.computed || !key.isIdentifier();
      const member = t.memberExpression(
        object,
        computed ? cloneFormula(key, state, seenBindings) : t.cloneNode(property.node.key),
        computed,
      );
      if (!value.isAssignmentPattern()) return member;
      return t.conditionalExpression(
        t.binaryExpression('===', t.cloneNode(member), t.identifier('undefined')),
        cloneFormula(value.get('right'), state, seenBindings),
        member,
      );
    }
  }
  if (pattern.isArrayPattern()) {
    for (const [index, element] of pattern.get('elements').entries()) {
      if (!element?.node) continue;
      const target = element.isAssignmentPattern() ? element.get('left') : element;
      if (!target.isIdentifier({ name: localName })) continue;
      const array = cloneFormula(init, withLocalRange(state, init.node), nextSeen);
      const member = t.memberExpression(array, t.numericLiteral(index), true);
      if (!element.isAssignmentPattern()) return member;
      return t.conditionalExpression(
        t.binaryExpression('===', t.cloneNode(member), t.identifier('undefined')),
        cloneFormula(element.get('right'), state, seenBindings),
        member,
      );
    }
  }
  return null;
}

function bindingIsLocalToFormula(binding, state) {
  const range = nodeRange(binding.path?.node);
  return Boolean(range && state.localRanges.some((local) => (
    range.start >= local.start && range.end <= local.end
  )));
}

function withLocalRange(state, node) {
  const range = nodeRange(node);
  return range ? { ...state, localRanges: [...state.localRanges, range] } : state;
}

function nodeRange(node) {
  return Number.isInteger(node?.start) && Number.isInteger(node?.end)
    ? { start: node.start, end: node.end }
    : null;
}

function recogniseTween(path) {
  const resolved = resolveConstant(path);
  if (!resolved?.isCallExpression() || !t.isIdentifier(resolved.node.callee, { name: 'interpolate' })) return null;
  const args = resolved.get('arguments');
  if (args.length < 4 || !isDirectFrameValue(args[0])) return null;
  const input = numericPair(args[1]);
  const output = numericPair(args[2]);
  if (!input || !output || input[1] < input[0]
      || output.some((value) => value < 0 || value > 1)
      || !linearClampedInterpolation(args[3])) return null;
  return { type: 'tween', start: input[0], end: input[1], from: output[0], to: output[1], easing: 'linear' };
}

function isDirectFrameValue(path) {
  const resolved = resolveConstant(path);
  return Boolean(resolved?.isCallExpression() && isHookPath(resolved, 'useCurrentFrame'));
}

function numericPair(path) {
  if (!path?.isArrayExpression() || path.node.elements.length !== 2) return null;
  const values = path.node.elements.map((element) => t.isNumericLiteral(element) ? element.value : null);
  return values.every((value) => value !== null) ? values : null;
}

function linearClampedInterpolation(path) {
  if (!path?.isObjectExpression()) return false;
  const fields = new Map();
  for (const property of path.get('properties')) {
    if (!property.isObjectProperty() || property.node.computed) return false;
    const key = property.node.key;
    const name = t.isIdentifier(key) ? key.name : key.value;
    if (!['extrapolateLeft', 'extrapolateRight', 'easing'].includes(name)) return false;
    fields.set(name, property.get('value'));
  }
  if (!fields.get('extrapolateLeft')?.isStringLiteral({ value: 'clamp' })
      || !fields.get('extrapolateRight')?.isStringLiteral({ value: 'clamp' })) return false;
  const easing = fields.get('easing');
  return !easing || (easing.isMemberExpression()
    && !easing.node.computed
    && t.isIdentifier(easing.node.object, { name: 'Easing' })
    && t.isIdentifier(easing.node.property, { name: 'linear' }));
}

function findStylePath(propsPath) {
  const resolved = resolveConstant(propsPath);
  return resolved?.isObjectExpression() ? findObjectPropertyValue(resolved, 'style') : null;
}

function findObjectPropertyValue(objectPath, name) {
  const resolved = resolveConstant(objectPath);
  if (!resolved?.isObjectExpression()) return null;
  let found = null;
  for (const property of resolved.get('properties')) {
    if (property.isSpreadElement()) { found = null; continue; }
    if (!property.isObjectProperty() || property.node.computed) continue;
    const key = property.node.key;
    if ((t.isIdentifier(key) && key.name === name) || (t.isStringLiteral(key) && key.value === name)) {
      found = property.get('value');
    }
  }
  return found ? resolveConstant(found) : null;
}

function resolveConstant(path, seen = new Set()) {
  if (!path?.node || !path.isIdentifier()) return path;
  const binding = path.scope.getBinding(path.node.name);
  if (!binding || !binding.constant || seen.has(binding) || !binding.path.isVariableDeclarator()) return path;
  const init = binding.path.get('init');
  if (!init?.node) return path;
  seen.add(binding);
  return resolveConstant(init, seen);
}

function frameDependent(path, seenBindings = new Set()) {
  const resolved = resolveConstant(path, seenBindings);
  if (!resolved?.node) return false;
  if (resolved.isCallExpression() && isHookPath(resolved, 'useCurrentFrame')) return true;
  if (resolved.isIdentifier()) {
    const binding = resolved.scope.getBinding(resolved.node.name);
    if (!binding || seenBindings.has(binding) || !binding.path.isVariableDeclarator()) return false;
    return frameDependent(binding.path.get('init'), new Set(seenBindings).add(binding));
  }
  let dynamic = false;
  resolved.traverse({
    CallExpression(inner) {
      if (isHookPath(inner, 'useCurrentFrame')) { dynamic = true; inner.stop(); }
    },
    Identifier(inner) {
      if (dynamic || !inner.isReferencedIdentifier()) return;
      const binding = inner.scope.getBinding(inner.node.name);
      if (!binding || seenBindings.has(binding) || !binding.path.isVariableDeclarator()) return;
      if (frameDependent(binding.path.get('init'), new Set(seenBindings).add(binding))) {
        dynamic = true;
        inner.stop();
      }
    },
  });
  return dynamic;
}

function transformOperations(path) {
  const skeleton = expressionSkeleton(resolveConstant(path));
  if (skeleton === null) return [];
  return scanFunctions(skeleton).map(({ name, body }) => {
    if (name === 'scale' && splitArguments(body).length === 1) return { name, kind: 'scale', unit: null };
    if (['translate', 'translateX', 'translateY'].includes(name)) {
      if (body.includes('(')) return { name, kind: null, unit: null };
      return { name, kind: 'translate', unit: firstUnit(body) ?? 'px' };
    }
    if (name === 'rotate') return { name, kind: 'rotate', unit: firstUnit(body) ?? 'deg' };
    return { name, kind: null, unit: null };
  });
}

function expressionSkeleton(path) {
  if (!path?.node) return null;
  const node = path.node;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return String(node.value);
  if (t.isTemplateLiteral(node)) {
    let value = node.quasis[0]?.value.cooked ?? '';
    node.expressions.forEach((_expression, index) => { value += `0${node.quasis[index + 1]?.value.cooked ?? ''}`; });
    return value;
  }
  if (t.isBinaryExpression(node, { operator: '+' })) {
    const left = expressionSkeleton(path.get('left'));
    const right = expressionSkeleton(path.get('right'));
    return left === null || right === null ? null : left + right;
  }
  if (t.isIdentifier(node)) {
    const resolved = resolveConstant(path);
    return resolved === path ? '0' : expressionSkeleton(resolved);
  }
  return '0';
}

function scanFunctions(value) {
  const output = [];
  const expression = String(value);
  let cursor = 0;
  while (cursor < expression.length) {
    const match = /([A-Za-z][\w-]*)\s*\(/g;
    match.lastIndex = cursor;
    const found = match.exec(expression);
    if (!found) break;
    let depth = 1;
    let end = match.lastIndex;
    while (end < expression.length && depth > 0) {
      if (expression[end] === '(') depth += 1;
      else if (expression[end] === ')') depth -= 1;
      end += 1;
    }
    if (depth !== 0) return [];
    output.push({ name: found[1], body: expression.slice(match.lastIndex, end - 1) });
    cursor = end;
  }
  return output;
}

function splitArguments(value) { return value.split(/\s*,\s*|\s+/).filter(Boolean); }
function firstUnit(value) { return String(value).match(/[+-]?(?:\d+\.?\d*|\.\d+)\s*([A-Za-z%]+)/)?.[1] ?? null; }
function isElementCall(node) {
  if (t.isIdentifier(node.callee, { name: '__v2Element' })) return true;
  return t.isMemberExpression(node.callee) && !node.callee.computed
    && t.isIdentifier(node.callee.object, { name: 'React' })
    && t.isIdentifier(node.callee.property, { name: 'createElement' });
}
function isHookPath(path, name) {
  const callee = path.node.callee;
  if (!isNamedHook(callee, name)) return false;
  if (t.isIdentifier(callee)) {
    const binding = path.scope.getBinding(callee.name);
    return !binding || binding.kind === 'module';
  }
  const object = callee.object;
  if (!t.isIdentifier(object)) return true;
  const binding = path.scope.getBinding(object.name);
  return !binding || binding.kind === 'module';
}
function isNamedHook(callee, name) {
  return t.isIdentifier(callee, { name }) || (t.isMemberExpression(callee) && !callee.computed
    && t.isIdentifier(callee.property, { name }));
}
function describeType(node) {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isIdentifier(node, { name: '__v2Fragment' })) return 'fragment';
  if (t.isIdentifier(node)) return node.name;
  return 'expression';
}
function capitalise(value) { return `${value[0].toUpperCase()}${value.slice(1)}`; }
