import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

import { normalizeCbaV2Features } from './features.js';
import {
  hasTrustedSignalBindings,
  lowerSignalFormula,
  lowerTransformSignal,
} from './signal-ir.js';

const traverse = traverseModule.default ?? traverseModule;
const ENTRY_NAMES = ['GeneratedComposition', 'Composition', 'VideoComposition', 'Root'];
const VISUAL_CLASSES = Object.freeze({
  opacity: 'Opacity',
  rotate: 'Rotate',
  scale: 'Scale',
  translate: 'Translate',
});
const PUBLIC_UNIT = Object.freeze({
  audio: Object.freeze({ feature: 'publicAudioUnit', className: 'Audio', kind: 'unit.audio', adapter: 'renderAudio', component: 'Audio' }),
  box: Object.freeze({ feature: 'publicBoxUnit', className: 'Box', kind: 'unit.box', adapter: 'renderBox' }),
  group: Object.freeze({ feature: 'publicGroupUnit', className: 'Group', kind: 'unit.group', adapter: 'renderGroup' }),
  image: Object.freeze({ feature: 'publicImageUnit', className: 'Image', kind: 'unit.image', adapter: 'renderImage', component: 'Img' }),
  layer: Object.freeze({ feature: 'publicLayerUnit', className: 'Layer', kind: 'unit.layer', adapter: 'renderLayer', component: 'AbsoluteFill' }),
  text: Object.freeze({ feature: 'publicLabelUnit', className: 'Text', kind: 'unit.text', adapter: 'renderText' }),
  video: Object.freeze({ feature: 'publicVideoUnit', className: 'Video', kind: 'unit.video', adapter: 'renderVideo', component: 'OffthreadVideo' }),
});
const PROTOTYPE_MUTATION_CACHE = new WeakMap();

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
      descriptor.unit = classifyUnit(path, features, descriptor);
      if (descriptor.sourceDependentVisualComputations.length > 0) {
        descriptor.unit = nativeUnit();
      }
      if (descriptor.unit.implementation === 'library'
          && descriptor.promotedTransformIndexes
          && descriptor.promotedTransformIndexes.length < descriptor.transformOperationCount) {
        descriptor.unit = nativeUnit();
      }
      descriptor.behaviours.forEach((behaviour) => {
        if (behaviour.implementation !== 'local') return;
        behaviour.className = `Local${capitalise(behaviour.kind)}Behaviour${behaviours.length}`;
      });
      targets.set(key, descriptor);
      units.push({
        key,
        className: descriptor.unit.className,
        kind: descriptor.unit.kind,
        implementation: descriptor.unit.implementation,
        sourceDependentVisualComputations: descriptor.sourceDependentVisualComputations.length,
        tag: describeType(path.node.arguments[0]),
      });
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

/**
 * Promote only element shapes whose public Unit + static adapter is an exact
 * representation. Local components, conditional children and opaque props stay
 * behind NativeUnit; the compiler never guesses from a component's name.
 */
function classifyUnit(callPath, features, visual) {
  const [type] = callPath.get('arguments');
  const props = resolvedObjectProperties(callPath.get('arguments.1'));
  const children = callPath.get('arguments').slice(2);
  const directUnitChildren = children.every(isDirectElementPath);
  const childPlans = directUnitChildren
    ? []
    : children.map((child) => normalizableChildPlan(child, features));
  const normalizeChildren = !directUnitChildren
    && features.collectionChildren
    && childPlans.every(({ supported }) => supported);
  const unitChildren = directUnitChildren || normalizeChildren;
  const normalizePrimitiveChildren = normalizeChildren
    && childPlans.some(({ primitive }) => primitive);
  const normalizedDependencies = normalizePrimitiveChildren ? ['TextNode'] : [];
  const normalization = { normalizeChildren, normalizePrimitiveChildren };
  const omittedStyleKeys = fullyExtractedStyleKeys(visual);
  const plainStyle = definitelyPlainStyle(props?.get('style'), omittedStyleKeys);

  if (type?.isIdentifier({ name: '__v2Fragment' }) && unitChildren) {
    return publicUnit('group', features, normalizedDependencies, normalization);
  }
  if (type?.isStringLiteral({ value: 'div' })
      && props?.has('style') && plainStyle
      && propsHaveOnly(props, ['key', 'style']) && unitChildren) {
    const dependencies = normalizeChildren || children.length !== 1
      ? ['Group', ...normalizedDependencies]
      : [];
    return publicUnit('box', features, dependencies, normalization);
  }
  if (type?.isStringLiteral({ value: 'span' })
      && props?.has('style') && plainStyle && propsHaveOnly(props, ['key', 'style'])
      && children.length === 1 && children[0].isStringLiteral()) {
    return publicUnit('text', features);
  }
  if (!type?.isIdentifier() || !isExternalComponent(type, type.node.name)) return nativeUnit();

  if (type.isIdentifier({ name: 'AbsoluteFill' })
      && props?.has('style') && plainStyle
      && propsHaveOnly(props, ['key', 'style']) && unitChildren) {
    const dependencies = normalizeChildren || children.length !== 1
      ? ['Group', ...normalizedDependencies]
      : [];
    return publicUnit('layer', features, dependencies, normalization);
  }
  if (type.isIdentifier({ name: 'Img' })
      && props?.has('style') && plainStyle
      && propsHaveOnly(props, ['key', 'src', 'style'])
      && children.length === 0 && definitelyNonEmptyString(props?.get('src'))
      && !frameDependent(props.get('src'))) {
    return publicUnit('image', features);
  }
  if (type.isIdentifier({ name: 'Audio' })
      && propsHaveOnly(props, ['key', 'src'])
      && children.length === 0 && definitelyNonEmptyString(props?.get('src'))
      && !frameDependent(props.get('src'))) {
    return publicUnit('audio', features);
  }
  if (type.isIdentifier({ name: 'OffthreadVideo' })
      && props?.has('style') && plainStyle
      && propsHaveOnly(props, ['key', 'muted', 'playbackRate', 'src', 'style', 'transparent'])
      && children.length === 0
      && definitelyNonEmptyString(props?.get('src'))
      && !frameDependent(props.get('src'))
      && optionalTrue(props, 'muted')
      && optionalTrue(props, 'transparent')
      && optionalNonDefaultFiniteNumber(props, 'playbackRate', 1)) {
    return publicUnit('video', features);
  }
  return nativeUnit();
}

function publicUnit(name, features, dependencies = [], options = {}) {
  const { feature, ...descriptor } = PUBLIC_UNIT[name];
  if (!features[feature]
      || (dependencies.includes('Group') && !features.publicGroupUnit)) {
    return nativeUnit();
  }
  return { ...descriptor, dependencies, ...options, implementation: 'library' };
}

function nativeUnit() {
  return {
    className: 'NativeUnit', kind: null, adapter: null, component: null,
    dependencies: [], implementation: 'native',
  };
}

function resolvedObjectProperties(path) {
  if (resolvedBindingHasMemberWrite(path)) return null;
  const resolved = resolveConstant(path);
  if (resolved?.isNullLiteral()) return new Map();
  if (!resolved?.isObjectExpression()) return null;
  const output = new Map();
  for (const property of resolved.get('properties')) {
    if (!property.isObjectProperty() || property.node.computed) return null;
    const key = property.node.key;
    const name = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : null;
    if (name === null || output.has(name)) return null;
    output.set(name, property.get('value'));
  }
  return output;
}

function propsHaveOnly(props, allowed) {
  return props !== null && [...props.keys()].every((name) => allowed.includes(name));
}

function fullyExtractedStyleKeys(visual) {
  const keys = new Set();
  if (visual.stripStyleKeys.includes('opacity')) keys.add('opacity');
  if (visual.stripStyleKeys.includes('transform')
      && visual.promotedTransformIndexes?.length === visual.transformOperationCount) {
    keys.add('transform');
  }
  return keys;
}

function definitelyPlainStyle(path, omittedKeys) {
  if (resolvedBindingHasMemberWrite(path)) return false;
  const resolved = resolveConstant(path);
  if (!resolved?.isObjectExpression()) return false;
  for (const property of resolved.get('properties')) {
    if (!property.isObjectProperty() || property.node.computed) return false;
    const key = property.node.key;
    const name = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : null;
    if (name === null || name === '__proto__') return false;
    if (omittedKeys.has(name)) continue;
    if (!definitelyPlainSerializable(property.get('value'))) return false;
  }
  return true;
}

function definitelyPlainSerializable(path, seenBindings = new Set()) {
  if (!path?.node) return false;
  if (path.isNullLiteral() || path.isStringLiteral() || path.isBooleanLiteral()) return true;
  if (path.isNumericLiteral()) return Number.isFinite(path.node.value);
  if (definitelyNumericExpression(path, seenBindings)) return true;
  if (path.isTemplateLiteral()) return true;
  if (path.isIdentifier({ name: 'undefined' }) && !path.scope.getBinding('undefined')) return true;
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding || !binding.constant || seenBindings.has(binding)
        || !binding.path.isVariableDeclarator()
        || bindingHasMemberWrite(binding)) return false;
    const init = binding.path.get('init');
    return Boolean(init?.node) && definitelyPlainSerializable(
      init,
      new Set(seenBindings).add(binding),
    );
  }
  if (path.isArrayExpression()) {
    return path.get('elements').every((element) => (
      !element?.node || (!element.isSpreadElement()
        && definitelyPlainSerializable(element, seenBindings))
    ));
  }
  if (path.isObjectExpression()) {
    return path.get('properties').every((property) => (
      property.isObjectProperty()
      && !property.node.computed
      && !((t.isIdentifier(property.node.key) || t.isStringLiteral(property.node.key))
        && property.node.key.name === '__proto__')
      && !(t.isStringLiteral(property.node.key, { value: '__proto__' }))
      && definitelyPlainSerializable(property.get('value'), seenBindings)
    ));
  }
  if (path.isConditionalExpression()) {
    return definitelyPlainSerializable(path.get('consequent'), seenBindings)
      && definitelyPlainSerializable(path.get('alternate'), seenBindings);
  }
  if (path.isLogicalExpression()) {
    return definitelyPlainSerializable(path.get('left'), seenBindings)
      && definitelyPlainSerializable(path.get('right'), seenBindings);
  }
  if (path.isUnaryExpression()
      && ['!', 'typeof', 'void'].includes(path.node.operator)) return true;
  if (path.isUnaryExpression()
      && ['+', '-', '~'].includes(path.node.operator)
      && path.get('argument').isNumericLiteral()) {
    const value = path.node.operator === '+'
      ? +path.node.argument.value
      : path.node.operator === '-'
        ? -path.node.argument.value
        : ~path.node.argument.value;
    return Number.isFinite(value);
  }
  if (path.isBinaryExpression()
      && ['==', '===', '!=', '!==', '<', '<=', '>', '>=', 'in', 'instanceof']
        .includes(path.node.operator)) return true;
  if (path.isBinaryExpression({ operator: '+' })
      && (definitelyString(path.get('left')) || definitelyString(path.get('right')))) {
    return true;
  }
  return false;
}

function resolvedBindingHasMemberWrite(path) {
  if (!path?.isIdentifier()) return false;
  const binding = path.scope.getBinding(path.node.name);
  return Boolean(binding && bindingHasMemberWrite(binding));
}

function bindingHasMemberWrite(binding) {
  return bindingHasUnsafeMutableUse(binding, new Set());
}

function bindingHasUnsafeMutableUse(binding, seenBindings) {
  if (!binding || seenBindings.has(binding)) return false;
  const nextSeen = new Set(seenBindings).add(binding);
  return binding.referencePaths.some((reference) => {
    let target = reference;
    while (target.parentPath?.isMemberExpression() && target.key === 'object') {
      target = target.parentPath;
    }
    const parent = target.parentPath;
    if (
      (parent?.isAssignmentExpression() && target.key === 'left')
      || (parent?.isUpdateExpression() && target.key === 'argument')
      || (parent?.isUnaryExpression({ operator: 'delete' }) && target.key === 'argument')
    ) return true;

    // Native Array#map is the only method call this analysis treats as a
    // non-mutating read. Every other method can mutate its receiver or expose
    // it to user code (push/splice and custom methods are common examples).
    if (parent?.isCallExpression() && target.key === 'callee') {
      return !(target.isMemberExpression()
        && !target.node.computed
        && target.get('property').isIdentifier({ name: 'map' })
        && globalBuiltinIsPristine(reference, 'Array'));
    }
    if ((parent?.isCallExpression() || parent?.isNewExpression())
        && target.listKey === 'arguments'
        && !isElementCall(parent.node)) {
      if (target !== reference && target.isMemberExpression()) {
        if (definitelyImmutableMemberRead(target)) return false;
      }
      return true;
    }

    // Follow a plain identifier alias so writes through `alias.x` cannot make
    // a literal look immutable. Destructuring and assignment aliases are more
    // complex, so they deliberately fail closed.
    if (reference.parentPath?.isVariableDeclarator()
        && reference.key === 'init') {
      const id = reference.parentPath.get('id');
      if (!id.isIdentifier()) return true;
      const alias = reference.parentPath.scope.getBinding(id.node.name);
      return !alias || bindingHasUnsafeMutableUse(alias, nextSeen);
    }
    if (parent?.isAssignmentExpression() && target.key === 'right') return true;
    if (parent?.isSpreadElement()) return true;
    if (bindingMayHoldMutableValue(binding)
        && reference.parentPath?.isObjectProperty()
        && reference.key === 'value'
        && !isImmediateElementPropsObject(reference.parentPath.parentPath)) return true;
    if (bindingMayHoldMutableValue(binding)
        && (reference.parentPath?.isArrayExpression()
          || reference.parentPath?.isReturnStatement()
          || reference.parentPath?.isYieldExpression())) return true;
    return false;
  });
}

function definitelyImmutableMemberRead(path) {
  if (path.isMemberExpression()
      && !path.node.computed
      && path.get('property').isIdentifier({ name: 'length' })) {
    const values = staticValueCandidates(path.get('object'), new Set());
    if (values !== null && values.length > 0 && values.every((candidate) => (
      candidate.isArrayExpression()
      || candidate.isStringLiteral()
      || candidate.isTemplateLiteral()
    ))) return true;
  }
  const candidates = staticMemberValueCandidates(
    path,
    new Set(),
    { ignoreMutationCheck: true },
  );
  return candidates !== null && candidates.length > 0
    && candidates.every(definitelyImmutablePrimitive);
}

function bindingMayHoldMutableValue(binding) {
  if (!binding?.path?.isVariableDeclarator()) return true;
  const resolved = resolveConstant(binding.path.get('init'));
  return !resolved?.node
    || resolved.isObjectExpression()
    || resolved.isArrayExpression()
    || resolved.isFunction();
}

function isImmediateElementPropsObject(path) {
  return Boolean(path?.isObjectExpression()
    && path.parentPath?.isCallExpression()
    && isElementCall(path.parentPath.node)
    && path.key === 1);
}

function isDirectElementPath(path) {
  return path?.isCallExpression() && isElementCall(path.node);
}

/**
 * A closed React-child grammar. Unknown values never become public graph
 * members merely because the runtime normalizer might happen to accept them.
 */
function normalizableChildPlan(path, features, seenBindings = new Set()) {
  if (!path?.node) return childPlan(false, false);
  if (isDirectElementPath(path)) return childPlan(true, false);
  if (path.isNullLiteral() || path.isBooleanLiteral()) return childPlan(true, false);
  if (path.isStringLiteral() || path.isNumericLiteral() || path.isTemplateLiteral()) {
    return childPlan(features.primitiveChildUnit, true);
  }
  if (path.isMemberExpression()) {
    const candidates = staticMemberValueCandidates(path, seenBindings);
    if (candidates !== null) {
      if (candidates.length === 0) return childPlan(true, false);
      return combineChildPlans(candidates.map((candidate) => (
        normalizableChildPlan(candidate, features, seenBindings)
      )));
    }
  }
  if (path.isIdentifier({ name: 'undefined' }) && !path.scope.getBinding('undefined')) {
    return childPlan(true, false);
  }
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding || !binding.constant || seenBindings.has(binding)
        || !binding.path.isVariableDeclarator()) return childPlan(false, false);
    const init = binding.path.get('init');
    if (!init?.node || childValueMayBeCollection(init, seenBindings)) {
      return childPlan(false, false);
    }
    return normalizableChildPlan(init, features, new Set(seenBindings).add(binding));
  }
  if (path.isArrayExpression()) {
    const plans = path.get('elements').map((element) => {
      if (!element?.node) return childPlan(true, false);
      if (element.isSpreadElement()) {
        if (!isKnownArrayPath(element.get('argument'), seenBindings)) {
          return childPlan(false, false);
        }
        return normalizableChildPlan(element.get('argument'), features, seenBindings);
      }
      return normalizableChildPlan(element, features, seenBindings);
    });
    return combineChildPlans(plans);
  }
  if (path.isConditionalExpression()) {
    return combineChildPlans([
      normalizableChildPlan(path.get('consequent'), features, seenBindings),
      normalizableChildPlan(path.get('alternate'), features, seenBindings),
    ]);
  }
  if (path.isUnaryExpression({ operator: '!' })) return childPlan(true, false);
  if (path.isBinaryExpression()
      && ['==', '===', '!=', '!==', '<', '<=', '>', '>=', 'in', 'instanceof']
        .includes(path.node.operator)) return childPlan(true, false);
  if (path.isLogicalExpression()) {
    return combineChildPlans([
      normalizableChildPlan(path.get('left'), features, seenBindings),
      normalizableChildPlan(path.get('right'), features, seenBindings),
    ]);
  }
  if (path.isSequenceExpression()) {
    const expressions = path.get('expressions');
    return expressions.length > 0
      ? normalizableChildPlan(expressions.at(-1), features, seenBindings)
      : childPlan(false, false);
  }
  const collectionCallback = knownCollectionCallback(path, seenBindings);
  if (collectionCallback) {
    const callback = collectionCallback;
    const returned = callbackReturnPath(callback);
    return returned !== null
      ? normalizableChildPlan(returned, features, seenBindings)
      : childPlan(false, false);
  }
  return childPlan(false, false);
}

function childPlan(supported, primitive) {
  return { supported, primitive: supported && primitive };
}

function combineChildPlans(plans) {
  return childPlan(
    plans.every(({ supported }) => supported),
    plans.some(({ primitive }) => primitive),
  );
}

function knownCollectionCallback(path, seenBindings) {
  if (!path.isCallExpression()) return false;
  const callee = path.get('callee');
  if (callee.isMemberExpression()
    && !callee.node.computed
    && callee.get('property').isIdentifier({ name: 'map' })
    && path.node.arguments.length === 1
    && path.get('arguments.0').isFunction()
    && isKnownArrayPath(callee.get('object'), seenBindings)
    && globalBuiltinIsPristine(path, 'Array')) {
    return path.get('arguments.0');
  }
  if (callee.isMemberExpression()
      && !callee.node.computed
      && callee.get('object').isIdentifier({ name: 'Array' })
      && !callee.get('object').scope.getBinding('Array')
      && callee.get('property').isIdentifier({ name: 'from' })
      && path.node.arguments.length === 2
      && path.get('arguments.1').isFunction()
      && globalBuiltinIsPristine(path, 'Array')) {
    return path.get('arguments.1');
  }
  return null;
}

function isKnownArrayPath(path, seenBindings = new Set()) {
  if (resolvedBindingHasMemberWrite(path)) return false;
  const resolved = resolveConstant(path, new Set(seenBindings));
  return Boolean(resolved?.isArrayExpression()
    && !resolved.get('elements').some((element) => element?.isSpreadElement())
    && globalBuiltinIsPristine(path, 'Array'));
}

function childValueMayBeCollection(path, seenBindings = new Set()) {
  if (!path?.node) return false;
  if (path.isArrayExpression() || knownCollectionCallback(path, seenBindings)) return true;
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding || !binding.constant || seenBindings.has(binding)
        || !binding.path.isVariableDeclarator()) return false;
    return childValueMayBeCollection(
      binding.path.get('init'),
      new Set(seenBindings).add(binding),
    );
  }
  if (path.isConditionalExpression()) {
    return childValueMayBeCollection(path.get('consequent'), seenBindings)
      || childValueMayBeCollection(path.get('alternate'), seenBindings);
  }
  if (path.isLogicalExpression()) {
    return childValueMayBeCollection(path.get('left'), seenBindings)
      || childValueMayBeCollection(path.get('right'), seenBindings);
  }
  if (path.isSequenceExpression()) {
    const expressions = path.get('expressions');
    return expressions.length > 0
      && childValueMayBeCollection(expressions.at(-1), seenBindings);
  }
  return false;
}

function callbackReturnPath(path) {
  if (!path?.node || !path.isArrowFunctionExpression()
      || path.node.async || path.node.generator) return null;
  const body = path.get('body');
  if (!body.isBlockStatement()) return body;
  const statements = body.get('body');
  const last = statements.at(-1);
  if (!last?.isReturnStatement() || !last.get('argument')?.node) return null;
  let unsupportedReturn = false;
  for (const statement of statements.slice(0, -1)) {
    if (statement.isReturnStatement()
        && !ignorableCollectionReturn(statement.get('argument'))) return null;
    statement.traverse({
      Function(inner) { inner.skip(); },
      ReturnStatement(inner) {
        if (!ignorableCollectionReturn(inner.get('argument'))) {
          unsupportedReturn = true;
          inner.stop();
        }
      },
    });
    if (unsupportedReturn) return null;
  }
  return last.get('argument');
}

function ignorableCollectionReturn(path) {
  return !path?.node
    || path.isNullLiteral()
    || path.isBooleanLiteral()
    || (path.isIdentifier({ name: 'undefined' }) && !path.scope.getBinding('undefined'))
    || path.isUnaryExpression({ operator: 'void' });
}

/**
 * Resolve every value a read from immutable literal data can produce. This is
 * intentionally finite: arbitrary objects, spreads, writes and string-keyed
 * array access fail closed. A numeric array index may select any literal
 * element; evaluating the original expression still owns out-of-range errors.
 */
function staticMemberValueCandidates(path, seenBindings = new Set(), options = {}) {
  if (!path?.isMemberExpression()) return null;
  const containers = staticContainerCandidates(path.get('object'), seenBindings, options);
  if (containers === null) return null;
  const property = staticMemberProperty(path);
  const numericSelection = property === null
    && path.node.computed
    && (options.ignoreMutationCheck
      ? uncheckedNumericSelection(path.get('property'), seenBindings)
      : definitelyNumericExpression(path.get('property'), seenBindings));
  if (property === null && !numericSelection) return null;

  const values = [];
  for (const container of containers) {
    if (container.isArrayExpression()) {
      const elements = container.get('elements');
      if (elements.some((element) => element?.isSpreadElement())) return null;
      if (!globalBuiltinIsPristine(path, 'Array')) return null;
      if (numericSelection) {
        values.push(...elements.filter((element) => element?.node));
        continue;
      }
      const index = typeof property === 'number'
        ? property
        : /^(?:0|[1-9]\d*)$/u.test(String(property)) ? Number(property) : null;
      if (!Number.isSafeInteger(index) || index < 0) return null;
      if (elements[index]?.node) values.push(elements[index]);
      else if (!globalBuiltinIsPristine(path, 'Object')) return null;
      continue;
    }
    if (!container.isObjectExpression() || numericSelection) return null;
    const properties = container.get('properties');
    const names = new Set();
    for (const candidate of properties) {
      if (!candidate.isObjectProperty() || candidate.node.computed) return null;
      const key = candidate.node.key;
      const name = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : null;
      if (name === null || name === '__proto__' || names.has(name)) return null;
      names.add(name);
    }
    const match = properties.find((candidate) => {
      const key = candidate.node.key;
      return (t.isIdentifier(key) ? key.name : key.value) === String(property);
    });
    // An absent own property can resolve through Object.prototype (including
    // a getter installed by the source), so absence is not proof of undefined.
    if (!match) return null;
    values.push(match.get('value'));
  }
  return values.length > 0 ? values : null;
}

function uncheckedNumericSelection(path, seenBindings) {
  const resolved = resolveConstant(path, new Set(seenBindings));
  if (resolved?.isIdentifier()) {
    const binding = resolved.scope.getBinding(resolved.node.name);
    if (binding?.kind === 'param' && binding.constant) {
      const callback = binding.path.parentPath;
      const parameterIndex = callback?.isFunction()
        ? callback.get('params').findIndex((parameter) => parameter.node === binding.path.node)
        : -1;
      const call = callback?.parentPath;
      const callee = call?.isCallExpression() ? call.get('callee') : null;
      if (parameterIndex === 1 && callee?.isMemberExpression()
          && !callee.node.computed
          && (callee.get('property').isIdentifier({ name: 'map' })
            || callee.get('property').isIdentifier({ name: 'from' }))) return true;
    }
  }
  return definitelyNumericExpression(path, seenBindings);
}

function staticContainerCandidates(path, seenBindings, options = {}) {
  if (!options.ignoreMutationCheck && resolvedBindingHasMemberWrite(path)) return null;
  const resolved = resolveConstant(path, new Set(seenBindings));
  if (!resolved?.node) return null;
  if (resolved.isArrayExpression() || resolved.isObjectExpression()) return [resolved];
  if (resolved.isMemberExpression()) {
    return staticMemberValueCandidates(resolved, seenBindings, options);
  }
  return null;
}

function definitelyImmutablePrimitive(path) {
  const resolved = resolveConstant(path);
  if (!resolved?.node) return false;
  if (resolved.isNullLiteral() || resolved.isStringLiteral()
      || resolved.isNumericLiteral() || resolved.isBooleanLiteral()
      || resolved.isTemplateLiteral()) return true;
  if (resolved.isIdentifier({ name: 'undefined' })
      && !resolved.scope.getBinding('undefined')) return true;
  if (resolved.isUnaryExpression()
      && ['!', '+', '-', '~', 'typeof', 'void'].includes(resolved.node.operator)) return true;
  return resolved.isBinaryExpression()
    && ['+', '==', '===', '!=', '!==', '<', '<=', '>', '>=', 'in', 'instanceof']
      .includes(resolved.node.operator);
}

function staticMemberProperty(path) {
  const property = path.get('property');
  if (!path.node.computed && property.isIdentifier()) return property.node.name;
  const resolved = resolveConstant(property);
  if (resolved?.isStringLiteral()) return resolved.node.value;
  if (resolved?.isNumericLiteral() && Number.isSafeInteger(resolved.node.value)) {
    return resolved.node.value;
  }
  return null;
}

function definitelyNumericExpression(path, seenBindings = new Set()) {
  return finiteNumericMagnitude(path, seenBindings) !== null;
}

/**
 * Return a conservative finite absolute bound, or null when an expression can
 * produce NaN/Infinity or is not provably numeric. Public Units deep-freeze
 * their data and reject non-finite numbers, so a mere typeof-number proof is
 * insufficient for lossless lowering.
 */
function finiteNumericMagnitude(path, seenBindings = new Set()) {
  const resolved = resolveConstant(path, new Set(seenBindings));
  if (!resolved?.node) return null;
  const evaluated = confidentlyEvaluatedNumber(resolved);
  if (evaluated.known) {
    return Number.isFinite(evaluated.value) ? Math.abs(evaluated.value) : null;
  }
  if (resolved.isNumericLiteral()) {
    return Number.isFinite(resolved.node.value) ? Math.abs(resolved.node.value) : null;
  }
  if (resolved.isIdentifier()) {
    const binding = resolved.scope.getBinding(resolved.node.name);
    if (!binding || seenBindings.has(binding)) return null;
    if (binding.kind === 'param') {
      return binding.constant && isCollectionIndexParameter(binding.path)
        ? Number.MAX_SAFE_INTEGER
        : null;
    }
    if (!binding.path.isVariableDeclarator()) return null;
    const nextSeen = new Set(seenBindings).add(binding);
    let magnitude = finiteNumericMagnitude(binding.path.get('init'), nextSeen);
    if (magnitude === null) return null;
    for (const violation of binding.constantViolations) {
      if (violation.isUpdateExpression()) {
        if (!boundedLoopCounter(binding)) return null;
        magnitude = Math.max(magnitude, Number.MAX_SAFE_INTEGER);
        continue;
      }
      if (!violation.isAssignmentExpression()) return null;
      if (violation.node.operator === '=') {
        const assigned = finiteNumericMagnitude(violation.get('right'), nextSeen);
        if (assigned === null) return null;
        magnitude = Math.max(magnitude, assigned);
        continue;
      }
      if (!boundedLoopCounter(binding)) return null;
      const operand = finiteNumericMagnitude(violation.get('right'), nextSeen);
      if (operand === null) return null;
      magnitude = Math.max(magnitude, Number.MAX_SAFE_INTEGER);
    }
    return magnitude;
  }
  if (resolved.isUnaryExpression()
      && ['+', '-', '~'].includes(resolved.node.operator)) {
    const argument = finiteNumericMagnitude(resolved.get('argument'), seenBindings);
    if (argument === null) return null;
    return resolved.node.operator === '~' ? 2 ** 31 : argument;
  }
  if (resolved.isBinaryExpression()
      && ['+', '-', '*', '/', '%', '<<', '>>', '>>>', '&', '|', '^']
        .includes(resolved.node.operator)) {
    const left = finiteNumericMagnitude(resolved.get('left'), seenBindings);
    const right = finiteNumericMagnitude(resolved.get('right'), seenBindings);
    if (left === null || right === null) return null;
    if (['<<', '>>', '&', '|', '^'].includes(resolved.node.operator)) return 2 ** 31;
    if (resolved.node.operator === '>>>') return (2 ** 32) - 1;
    if (resolved.node.operator === '/' || resolved.node.operator === '%') {
      const denominator = nonZeroNumericLowerBound(resolved.get('right'), seenBindings);
      if (denominator === null) return null;
      const magnitude = resolved.node.operator === '/' ? left / denominator : left;
      return Number.isFinite(magnitude) ? magnitude : null;
    }
    const magnitude = resolved.node.operator === '*' ? left * right : left + right;
    return Number.isFinite(magnitude) ? magnitude : null;
  }
  if (resolved.isConditionalExpression()) {
    const consequent = finiteNumericMagnitude(resolved.get('consequent'), seenBindings);
    const alternate = finiteNumericMagnitude(resolved.get('alternate'), seenBindings);
    return consequent === null || alternate === null ? null : Math.max(consequent, alternate);
  }
  if (resolved.isMemberExpression()
      && !resolved.node.computed
      && resolved.get('property').isIdentifier({ name: 'length' })) {
    const values = staticValueCandidates(resolved.get('object'), seenBindings);
    return values !== null && values.length > 0 && values.every((candidate) => (
      candidate.isArrayExpression()
      || candidate.isStringLiteral()
      || candidate.isTemplateLiteral()
    )) ? Number.MAX_SAFE_INTEGER : null;
  }
  if (resolved.isMemberExpression()) {
    const candidates = staticMemberValueCandidates(resolved, seenBindings);
    if (candidates === null || candidates.length === 0) return null;
    const magnitudes = candidates.map((candidate) => (
      finiteNumericMagnitude(candidate, seenBindings)
    ));
    return magnitudes.some((value) => value === null) ? null : Math.max(...magnitudes);
  }
  if (resolved.isCallExpression() && isHookPath(resolved, 'useCurrentFrame')) {
    return Number.MAX_SAFE_INTEGER;
  }
  if (resolved.isCallExpression()) {
    const callee = resolved.get('callee');
    if (callee.isIdentifier({ name: 'Number' })
        && !callee.scope.getBinding('Number')
        && globalBuiltinIsPristine(resolved, 'Number')) {
      const args = resolved.get('arguments');
      if (args.length === 0) return 0;
      if (args.length > 1 || args[0].isSpreadElement()) return null;
      return finiteNumericMagnitude(args[0], seenBindings);
    }
    if (callee.isMemberExpression()
        && !callee.node.computed
        && callee.get('object').isIdentifier({ name: 'Math' })
        && !callee.get('object').scope.getBinding('Math')
        && globalBuiltinIsPristine(resolved, 'Math')) {
      const method = callee.get('property').node.name;
      const args = resolved.get('arguments');
      const finitePreserving = new Set([
        'abs', 'atan', 'atan2', 'ceil', 'clz32', 'cos', 'floor', 'fround',
        'imul', 'max', 'min', 'round', 'sign', 'sin', 'tan', 'trunc',
      ]);
      if (!finitePreserving.has(method)
          || ((method === 'max' || method === 'min') && args.length === 0)
          || args.some((argument) => argument.isSpreadElement())) return null;
      const unaryMethods = new Set([
        'abs', 'atan', 'ceil', 'cos', 'floor', 'fround', 'round', 'sign',
        'sin', 'tan', 'trunc',
      ]);
      if (unaryMethods.has(method) && args.length !== 1) return null;
      if (method === 'atan2' && args.length !== 2) return null;
      const magnitudes = args.map((argument) => finiteNumericMagnitude(argument, seenBindings));
      if (magnitudes.some((value) => value === null)) return null;
      if (method === 'fround') {
        return magnitudes[0] <= 3.4028234663852886e38 ? magnitudes[0] : null;
      }
      if (['sin', 'cos', 'sign'].includes(method)) return 1;
      if (method === 'clz32') return 32;
      if (method === 'imul') return 2 ** 31;
      if (method === 'atan') return Math.PI / 2;
      if (method === 'atan2') return Math.PI;
      if (method === 'tan') return Number.MAX_VALUE;
      return magnitudes.length === 0 ? null : Math.max(...magnitudes);
    }
  }
  return null;
}

/** Prove a positive lower bound for |value|, used to keep division finite. */
function nonZeroNumericLowerBound(path, seenBindings = new Set()) {
  const resolved = resolveConstant(path, new Set(seenBindings));
  if (!resolved?.node) return null;
  const evaluated = confidentlyEvaluatedNumber(resolved);
  if (evaluated.known) {
    return Number.isFinite(evaluated.value) && evaluated.value !== 0
      ? Math.abs(evaluated.value)
      : null;
  }
  if (resolved.isNumericLiteral()) {
    return Number.isFinite(resolved.node.value) && resolved.node.value !== 0
      ? Math.abs(resolved.node.value)
      : null;
  }
  if (resolved.isUnaryExpression()
      && ['+', '-'].includes(resolved.node.operator)) {
    return nonZeroNumericLowerBound(resolved.get('argument'), seenBindings);
  }
  if (resolved.isBinaryExpression({ operator: '*' })) {
    const left = nonZeroNumericLowerBound(resolved.get('left'), seenBindings);
    const right = nonZeroNumericLowerBound(resolved.get('right'), seenBindings);
    if (left === null || right === null) return null;
    const product = left * right;
    return Number.isFinite(product) && product > 0 ? product : null;
  }
  if (resolved.isConditionalExpression()) {
    const consequent = nonZeroNumericLowerBound(resolved.get('consequent'), seenBindings);
    const alternate = nonZeroNumericLowerBound(resolved.get('alternate'), seenBindings);
    return consequent === null || alternate === null
      ? null
      : Math.min(consequent, alternate);
  }
  if (resolved.isMemberExpression()
      && !resolved.node.computed
      && resolved.get('property').isIdentifier({ name: 'length' })) {
    const values = staticValueCandidates(resolved.get('object'), seenBindings);
    if (values === null || values.length === 0) return null;
    const lengths = values.map(staticSequenceMinimumLength);
    return lengths.some((length) => length === null || length < 1)
      ? null
      : Math.min(...lengths);
  }
  if (resolved.isMemberExpression()) {
    const candidates = staticMemberValueCandidates(resolved, seenBindings);
    if (candidates === null || candidates.length === 0) return null;
    const bounds = candidates.map((candidate) => (
      nonZeroNumericLowerBound(candidate, seenBindings)
    ));
    return bounds.some((bound) => bound === null) ? null : Math.min(...bounds);
  }
  return null;
}

function staticSequenceMinimumLength(path) {
  if (path.isArrayExpression()) return path.node.elements.length;
  if (path.isStringLiteral()) return path.node.value.length;
  if (path.isTemplateLiteral()) {
    return path.node.quasis.reduce(
      (total, quasi) => total + (quasi.value.cooked ?? '').length,
      0,
    );
  }
  return null;
}

function confidentlyEvaluatedNumber(path) {
  try {
    const result = path.evaluate();
    return result.confident && typeof result.value === 'number'
      ? { known: true, value: result.value }
      : { known: false, value: undefined };
  } catch {
    return { known: false, value: undefined };
  }
}

function boundedLoopCounter(binding) {
  const declarator = binding.path;
  const declaration = declarator?.parentPath;
  const loop = declaration?.parentPath;
  if (!declarator?.isVariableDeclarator()
      || !declaration?.isVariableDeclaration()
      || !loop?.isForStatement()
      || loop.get('init').node !== declaration.node) return false;
  const test = loop.get('test');
  const update = loop.get('update');
  if (!test.isBinaryExpression()
      || !['<', '<=', '>', '>='].includes(test.node.operator)
      || !update.node) return false;
  const name = binding.identifier.name;
  const comparesCounter = (test.get('left').isIdentifier({ name })
      && definitelyNumericExpression(test.get('right')))
    || (test.get('right').isIdentifier({ name })
      && definitelyNumericExpression(test.get('left')));
  if (!comparesCounter) return false;
  if (update.isUpdateExpression()
      && update.get('argument').isIdentifier({ name })
      && ['++', '--'].includes(update.node.operator)) return true;
  return update.isAssignmentExpression()
    && update.get('left').isIdentifier({ name })
    && ['+=', '-='].includes(update.node.operator)
    && confidentlyEvaluatedNumber(update.get('right')).known;
}

function staticValueCandidates(path, seenBindings) {
  const resolved = resolveConstant(path, new Set(seenBindings));
  if (!resolved?.node) return null;
  if (resolved.isMemberExpression()) return staticMemberValueCandidates(resolved, seenBindings);
  return [resolved];
}

function isCollectionIndexParameter(path) {
  const callback = path.parentPath;
  if (!callback?.isFunction()) return false;
  const parameterIndex = callback.get('params').findIndex((parameter) => parameter.node === path.node);
  if (parameterIndex < 0) return false;
  const call = callback.parentPath;
  if (!call?.isCallExpression()) return false;
  const callee = call.get('callee');
  if (callee.isMemberExpression()
      && !callee.node.computed
      && callee.get('property').isIdentifier({ name: 'map' })) {
    return callback.key === 0
      && parameterIndex === 1
      && isKnownArrayPath(callee.get('object'))
      && globalBuiltinIsPristine(path, 'Array');
  }
  return callee.isMemberExpression()
    && !callee.node.computed
    && callee.get('object').isIdentifier({ name: 'Array' })
    && !callee.get('object').scope.getBinding('Array')
    && callee.get('property').isIdentifier({ name: 'from' })
    && callback.key === 1
    && parameterIndex === 1
    && globalBuiltinIsPristine(path, 'Array');
}

function globalBuiltinIsPristine(path, name) {
  const program = path.findParent((entry) => entry.isProgram());
  if (!program) return false;
  if (programHasPrototypeMutation(program)) return false;
  let pristine = true;
  const inspect = (reference) => {
      const identifierSpelling = reference.isIdentifier({ name });
      const computedSpelling = reference.isStringLiteral({ value: name })
        && reference.parentPath?.isMemberExpression()
        && reference.key === 'property'
        && reference.parentPath.node.computed;
      if (!pristine || (!identifierSpelling && !computedSpelling)) return;
      let target;
      if (identifierSpelling && !reference.scope.getBinding(name)) {
        target = reference;
      } else if (!computedSpelling) {
        return;
      }
      // `globalThis.Array` is the same intrinsic as the unqualified `Array`.
      // Babel does not consider its property identifier a referenced binding,
      // so normalize that spelling to the whole member before classifying it.
      if ((identifierSpelling || computedSpelling)
          && reference.parentPath?.isMemberExpression()
          && reference.key === 'property'
          && (!reference.parentPath.node.computed || computedSpelling)) {
        const object = reference.parentPath.get('object');
        if (!object.isIdentifier({ name: 'globalThis' })
            || object.scope.getBinding('globalThis')) return;
        target = reference.parentPath;
      }
      const properties = [];
      while (target.parentPath?.isMemberExpression() && target.key === 'object') {
        const property = target.parentPath.get('property');
        properties.push(!target.parentPath.node.computed && property.isIdentifier()
          ? property.node.name
          : property.isStringLiteral() ? property.node.value : null);
        target = target.parentPath;
      }
      const parent = target.parentPath;
      const writes = (parent?.isAssignmentExpression() && target.key === 'left')
        || (parent?.isUpdateExpression() && target.key === 'argument')
        || (parent?.isUnaryExpression({ operator: 'delete' }) && target.key === 'argument');
      const escapes = (parent?.isCallExpression() || parent?.isNewExpression())
        && target.listKey === 'arguments';
      const aliases = (reference.parentPath?.isVariableDeclarator()
          && reference.key === 'init')
        || (parent?.isAssignmentExpression() && target.key === 'right')
        || parent?.isSpreadElement();
      const mutatesPrototype = properties.includes('prototype')
        && parent?.isCallExpression() && target.key === 'callee';
      if (writes || escapes || aliases || mutatesPrototype) {
        pristine = false;
        reference.stop();
      }
  };
  program.traverse({
    Identifier: inspect,
    StringLiteral: inspect,
  });
  return pristine;
}

function programHasPrototypeMutation(program) {
  const cached = PROTOTYPE_MUTATION_CACHE.get(program.node);
  if (cached !== undefined) return cached;
  let mutated = false;
  const stop = (path) => {
    mutated = true;
    path.stop();
  };
  program.traverse({
    AssignmentExpression(candidate) {
      if (prototypeMutationTarget(candidate.get('left'))) stop(candidate);
    },
    UpdateExpression(candidate) {
      if (prototypeMutationTarget(candidate.get('argument'))) stop(candidate);
    },
    UnaryExpression(candidate) {
      if (candidate.node.operator === 'delete'
          && prototypeMutationTarget(candidate.get('argument'))) stop(candidate);
    },
    CallExpression(candidate) {
      const callee = candidate.get('callee');
      if (callee.isMemberExpression() && prototypeObject(callee.get('object'))) {
        stop(candidate);
        return;
      }
      if (!callee.isMemberExpression() || callee.node.computed) return;
      const object = callee.get('object');
      const property = callee.get('property');
      const intrinsicMutator = object.isIdentifier()
        && !object.scope.getBinding(object.node.name)
        && ((object.node.name === 'Object'
          && ['defineProperty', 'defineProperties', 'setPrototypeOf'].includes(property.node.name))
          || (object.node.name === 'Reflect'
            && ['defineProperty', 'set', 'setPrototypeOf'].includes(property.node.name)));
      if (intrinsicMutator && prototypeObject(candidate.get('arguments.0'))) stop(candidate);
    },
  });
  PROTOTYPE_MUTATION_CACHE.set(program.node, mutated);
  return mutated;
}

function prototypeMutationTarget(path) {
  if (!path?.isMemberExpression()) return false;
  return prototypeObject(path.get('object'));
}

function prototypeObject(path, seenBindings = new Set()) {
  if (!path?.node) return false;
  if (path.isIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (!binding || seenBindings.has(binding) || !binding.path.isVariableDeclarator()) return false;
    return prototypeObject(
      binding.path.get('init'),
      new Set(seenBindings).add(binding),
    );
  }
  if (path.isMemberExpression()) {
    const property = staticMemberProperty(path);
    return property === 'prototype'
      || property === '__proto__'
      || prototypeObject(path.get('object'), seenBindings);
  }
  if (path.isCallExpression()) {
    const callee = path.get('callee');
    return callee.isMemberExpression()
      && !callee.node.computed
      && callee.get('object').isIdentifier({ name: 'Object' })
      && !callee.get('object').scope.getBinding('Object')
      && callee.get('property').isIdentifier({ name: 'getPrototypeOf' });
  }
  return false;
}

function isExternalComponent(path, expectedName) {
  const binding = path.scope.getBinding(path.node.name);
  if (!binding) return true;
  if (binding.kind !== 'module') return false;
  const declaration = binding.path.findParent((entry) => entry.isImportDeclaration());
  if (!/(?:^|\/)(?:remotion|@remotion\/[^/]+)$/u.test(declaration?.node.source.value ?? '')
      || !binding.path.isImportSpecifier()) return false;
  const imported = binding.path.node.imported;
  const importedName = t.isIdentifier(imported) || t.isStringLiteral(imported)
    ? imported.name ?? imported.value
    : null;
  return importedName === expectedName;
}

function definitelyString(path, seen = new Set()) {
  const resolved = resolveConstant(path, seen);
  if (!resolved?.node) return false;
  if (resolved.isStringLiteral() || resolved.isTemplateLiteral()) return true;
  if (resolved.isBinaryExpression({ operator: '+' })) {
    return definitelyString(resolved.get('left'), seen) || definitelyString(resolved.get('right'), seen);
  }
  return false;
}

function definitelyNonEmptyString(path, seen = new Set()) {
  const resolved = resolveConstant(path, seen);
  if (!resolved?.node) return false;
  if (resolved.isStringLiteral()) return resolved.node.value.length > 0;
  if (resolved.isTemplateLiteral()) {
    return resolved.node.quasis.some((quasi) => (quasi.value.cooked ?? '').length > 0);
  }
  if (resolved.isBinaryExpression({ operator: '+' })) {
    return definitelyNonEmptyString(resolved.get('left'), seen)
      || definitelyNonEmptyString(resolved.get('right'), seen);
  }
  return false;
}

function optionalTrue(props, name) {
  const value = props.get(name);
  if (!value) return true;
  const resolved = resolveConstant(value);
  return resolved?.isBooleanLiteral({ value: true }) ?? false;
}

function optionalNonDefaultFiniteNumber(props, name, defaultValue) {
  const value = props.get(name);
  if (!value) return true;
  const resolved = resolveConstant(value);
  return resolved?.isNumericLiteral()
    && Number.isFinite(resolved.node.value)
    && resolved.node.value !== defaultValue;
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
  const result = { behaviours: [], sourceDependentVisualComputations: [], stripStyleKeys: [] };
  if (!stylePath) return result;
  const dynamicStyleKeys = frameDependentStyleKeys(stylePath);

  const opacityPath = findObjectPropertyValue(stylePath, 'opacity');
  if (opacityPath && frameDependent(opacityPath)) {
    const signal = recogniseTween(opacityPath);
    const useTween = Boolean(signal && features.opacityTween);
    const useFormula = !useTween && features.opacityFormula;
    const formula = useFormula ? contextualFormula(opacityPath) : null;
    const formulaSignal = useFormula && features.declarativeSignalIr
      && formula.mode === 'frame-context' && hasTrustedSignalBindings(opacityPath)
      ? lowerSignalFormula(formula.expression)
      : null;
    const useSignal = formulaSignal !== null;
    if (useTween || (useFormula && formula.mode === 'frame-context')) {
      result.behaviours.push({
        kind: 'opacity',
        className: useTween || useSignal ? VISUAL_CLASSES.opacity : 'LocalOpacityBehaviour',
        implementation: useTween || useSignal ? 'library' : 'local',
        signal: useTween ? signal : formulaSignal,
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
        const trustedSignalFormula = features.declarativeSignalIr
          && hasTrustedSignalBindings(transformPath);
        const promoted = operations.flatMap((operation, index) => (
          features[`${operation.kind}Formula`] ? [{ operation, index }] : []
        ));
        promoted.forEach(({ operation, index }) => {
          const formulaSignal = trustedSignalFormula
            ? lowerTransformSignal(formula.expression, {
              kind: operation.kind,
              operation: operation.name,
              operationIndex: index,
              unit: operation.unit,
            })
            : null;
          result.behaviours.push({
            kind: operation.kind,
            className: formulaSignal
              ? VISUAL_CLASSES[operation.kind]
              : `Local${capitalise(operation.kind)}Behaviour`,
            implementation: formulaSignal ? 'library' : 'local',
            operation: operation.name,
            operationIndex: index,
            unit: operation.unit,
            signal: formulaSignal,
            formula,
          });
        });
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
  const fullyExtracted = new Set();
  if (result.stripStyleKeys.includes('opacity')) fullyExtracted.add('opacity');
  if (result.stripStyleKeys.includes('transform')
      && result.promotedTransformIndexes?.length === result.transformOperationCount) {
    fullyExtracted.add('transform');
  }
  result.sourceDependentVisualComputations = dynamicStyleKeys
    .filter((key) => !fullyExtracted.has(key));
  return result;
}

function frameDependentStyleKeys(stylePath) {
  const resolved = resolveConstant(stylePath);
  if (!resolved?.isObjectExpression()) return frameDependent(resolved) ? ['*'] : [];
  const output = [];
  for (const property of resolved.get('properties')) {
    if (property.isSpreadElement()) {
      if (frameDependent(property.get('argument'))) output.push('*');
      continue;
    }
    if (!property.isObjectProperty()) continue;
    if (!frameDependent(property.get('value'))) continue;
    const key = property.node.key;
    output.push(property.node.computed
      ? '*'
      : t.isIdentifier(key) ? key.name : String(key.value));
  }
  return [...new Set(output)].sort();
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
