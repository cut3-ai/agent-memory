import generateModule from '@babel/generator';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

import { sourceKey } from './analyzer.js';
import { signalIrClassNames } from './signal-ir.js';

const generate = generateModule.default ?? generateModule;
const traverse = traverseModule.default ?? traverseModule;
const PACKAGE = '@cut3/agent-memory';
const DEFAULT_IMPORTS = Object.freeze({
  runtime: `${PACKAGE}/cba-v2/runtime`,
  react: 'react',
  remotion: 'remotion',
  remotionThree: '@remotion/three',
  reactThreeDrei: '@react-three/drei',
  three: 'three',
  Behaviour: `${PACKAGE}/core/Behaviour`,
  signals: `${PACKAGE}/core/signals`,
  Audio: `${PACKAGE}/units/audio`,
  Box: `${PACKAGE}/units/box`,
  Group: `${PACKAGE}/units/group`,
  Image: `${PACKAGE}/units/image`,
  Layer: `${PACKAGE}/units/layer`,
  Text: `${PACKAGE}/units/text`,
  TextNode: `${PACKAGE}/units/text-node`,
  Video: `${PACKAGE}/units/video`,
  renderAudio: `${PACKAGE}/drivers/react/adapters/audio`,
  renderBox: `${PACKAGE}/drivers/react/adapters/box`,
  renderGroup: `${PACKAGE}/drivers/react/adapters/group`,
  renderImage: `${PACKAGE}/drivers/react/adapters/image`,
  renderLayer: `${PACKAGE}/drivers/react/adapters/layer`,
  renderText: `${PACKAGE}/drivers/react/adapters/text`,
  renderTextNode: `${PACKAGE}/drivers/react/adapters/text-node`,
  renderVideo: `${PACKAGE}/drivers/react/adapters/video`,
  Opacity: `${PACKAGE}/behaviours/opacity`,
  Scale: `${PACKAGE}/behaviours/scale`,
  Translate: `${PACKAGE}/behaviours/translate`,
  Rotate: `${PACKAGE}/behaviours/rotate`,
});
const STATIC_NAMED_EXTERNALS = Object.freeze({
  AbsoluteFill: 'remotion',
  AnimatedImage: 'remotion',
  Audio: 'remotion',
  Easing: 'remotion',
  Img: 'remotion',
  OffthreadVideo: 'remotion',
  Sequence: 'remotion',
  Series: 'remotion',
  Video: 'remotion',
  continueRender: 'remotion',
  delayRender: 'remotion',
  interpolate: 'remotion',
  interpolateColors: 'remotion',
  measureSpring: 'remotion',
  random: 'remotion',
  spring: 'remotion',
  staticFile: 'remotion',
  useCurrentFrame: 'remotion',
  useVideoConfig: 'remotion',
  useCallback: 'react',
  useEffect: 'react',
  useLayoutEffect: 'react',
  useMemo: 'react',
  useRef: 'react',
  useState: 'react',
  ThreeCanvas: 'remotionThree',
  Center: 'reactThreeDrei',
  Cloud: 'reactThreeDrei',
  Environment: 'reactThreeDrei',
  Float: 'reactThreeDrei',
  OrthographicCamera: 'reactThreeDrei',
  PerspectiveCamera: 'reactThreeDrei',
  Sparkles: 'reactThreeDrei',
  Stars: 'reactThreeDrei',
  Text: 'reactThreeDrei',
  Text3D: 'reactThreeDrei',
});
const STATIC_NAMESPACE_EXTERNALS = Object.freeze({
  React: 'react',
  THREE: 'three',
});
const PLATFORM_GLOBALS = new Set([
  'Array', 'ArrayBuffer', 'BigInt', 'BigInt64Array', 'BigUint64Array', 'Blob', 'Boolean',
  'DataView', 'Date', 'Error', 'EvalError', 'FinalizationRegistry', 'Float32Array',
  'Float64Array', 'Function', 'Image', 'Infinity', 'Int16Array', 'Int32Array', 'Int8Array',
  'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Path2D', 'Promise', 'Proxy',
  'RangeError', 'ReferenceError', 'Reflect', 'RegExp', 'Set', 'SharedArrayBuffer', 'String',
  'Symbol', 'SyntaxError', 'TypeError', 'URIError', 'URL', 'URLSearchParams', 'Uint16Array',
  'Uint32Array', 'Uint8Array', 'Uint8ClampedArray', 'WeakMap', 'WeakRef', 'WeakSet',
  'atob', 'btoa', 'cancelAnimationFrame', 'clearInterval', 'clearTimeout', 'console',
  'decodeURI', 'decodeURIComponent', 'devicePixelRatio', 'document', 'encodeURI',
  'encodeURIComponent', 'escape', 'fetch', 'globalThis', 'isFinite', 'isNaN', 'navigator',
  'parseFloat', 'parseInt', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'self',
  'setInterval', 'setTimeout', 'structuredClone', 'undefined', 'unescape', 'window',
]);

/** Emit both the publishable ESM module and import-free verifier programs. */
export function emitComposition(parsed, analysis, options = {}) {
  const imports = { ...DEFAULT_IMPORTS, ...(options.imports ?? {}) };
  const allBehaviours = [...analysis.targets.values()].flatMap((target) => target.behaviours);
  const localBehaviours = allBehaviours.filter((item) => item.implementation === 'local');
  const behaviourClassNames = [...new Set(analysis.inventory.behaviours
    .filter((item) => item.implementation === 'library').map((item) => item.className))];
  const signalClassNames = [...new Set(allBehaviours.flatMap((item) => (
    item.signal && item.signal.type !== 'tween' ? signalIrClassNames(item.signal) : []
  )))].sort();
  const rendering = buildRenderingPlan(analysis, parsed.ast);
  const usesTween = analysis.inventory.behaviours.some((item) => item.signal?.type === 'tween');
  const runtimeUsage = {
    childNormalization: [...analysis.targets.values()].some(({ unit }) => unit.normalizeChildren),
    primitiveChildNormalization: [...analysis.targets.values()]
      .some(({ unit }) => unit.normalizePrimitiveChildren),
    fragment: analysis.inventory.units.some((item) => item.className === 'NativeUnit' && item.tag === 'fragment'),
    nativeUnit: analysis.inventory.units.some((item) => item.className === 'NativeUnit'),
    plainVisual: localBehaviours.some((item) => item.kind !== 'opacity'),
    propRead: rendering.unitClasses.some((name) => name !== 'Group'),
    styleRead: allBehaviours.some((item) => item.implementation === 'library' && !item.signal),
    transformRead: localBehaviours.some((item) => item.kind !== 'opacity'),
    stripStyle: allBehaviours.length > 0,
    tweenOptions: usesTween,
    unitsOption: allBehaviours.some((item) => item.implementation === 'library'
      && ['translate', 'rotate'].includes(item.kind)),
  };

  const cbaAst = prepareModule(parsed.ast, false);
  rewriteContextHooks(cbaAst);
  rewriteElements(cbaAst, analysis);
  appendChildNormalizer(
    cbaAst,
    runtimeUsage.childNormalization,
    runtimeUsage.primitiveChildNormalization,
  );
  appendLocalBehaviourClasses(cbaAst, localBehaviours);
  appendStaticUnitRenderer(cbaAst, rendering);
  appendCompositionApi(cbaAst, analysis.entryName, false, rendering);
  const body = generate(cbaAst, { comments: false, compact: false, jsescOption: { minimal: true } }).code;
  const header = buildImportHeader(imports, behaviourClassNames, {
    localBehaviours, rendering, runtimeUsage, signalClassNames, usesTween,
  });
  const linkage = linkStaticExternals(`${header.join('\n')}\n${body}\n`, imports);
  const program = linkage.program;

  let generatedParse = true;
  let generatedParseError = null;
  try { parse(program, { sourceType: 'module', plugins: ['typescript'] }); }
  catch (error) { generatedParse = false; generatedParseError = error?.name ?? 'ParseError'; }

  const cbaEvaluationAst = prepareModule(parsed.ast, true);
  rewriteContextHooks(cbaEvaluationAst);
  rewriteElements(cbaEvaluationAst, analysis);
  appendChildNormalizer(
    cbaEvaluationAst,
    runtimeUsage.childNormalization,
    runtimeUsage.primitiveChildNormalization,
  );
  appendLocalBehaviourClasses(cbaEvaluationAst, localBehaviours);
  appendCompositionApi(cbaEvaluationAst, analysis.entryName, true, rendering);

  const baselineAst = prepareModule(parsed.ast, true);
  rewriteContextHooks(baselineAst);
  restoreReactElements(baselineAst);
  appendCompositionApi(baselineAst, analysis.entryName, true);

  return {
    program,
    verification: {
      generatedParse,
      generatedParseError,
      publishableEsm: generatedParse
        && linkage.unresolvedExternalCount === 0
        && linkage.dynamicImportCount === 0,
      dynamicImportCount: linkage.dynamicImportCount,
      unresolvedExternalCount: linkage.unresolvedExternalCount,
      staticExternalImportCount: linkage.staticExternalImportCount,
      concreteClassImports: Object.freeze([
        ...(runtimeUsage.nativeUnit ? ['NativeUnit'] : []),
        ...rendering.unitClasses,
        ...behaviourClassNames,
        ...signalClassNames,
        ...(usesTween ? ['Tween'] : []),
      ]),
      localBehaviourClasses: Object.freeze(localBehaviours.map((item) => item.className)),
      classUnitCount: analysis.inventory.units.length,
      atomicBehaviourCount: analysis.inventory.behaviours.length,
    },
    evaluationPrograms: {
      baseline: generate(baselineAst, { comments: false }).code,
      cba: generate(cbaEvaluationAst, { comments: false }).code,
    },
    rendering,
  };
}

function buildRenderingPlan(analysis, sourceAst) {
  const descriptors = [...analysis.targets.values()].map(({ unit }) => unit);
  const unitClasses = new Set();
  const adapters = new Map();
  const components = {};
  for (const descriptor of descriptors) {
    if (descriptor.implementation !== 'library') continue;
    unitClasses.add(descriptor.className);
    descriptor.dependencies.forEach((name) => unitClasses.add(name));
    adapters.set(descriptor.className, descriptor.adapter);
    if (descriptor.component) components[componentRole(descriptor.className)] = descriptor.component;
  }
  if (unitClasses.has('Group')) adapters.set('Group', 'renderGroup');
  if (unitClasses.has('TextNode')) adapters.set('TextNode', 'renderTextNode');
  const reservedNames = collectIdentifierNames(sourceAst);
  const componentImports = [...new Set(Object.values(components))]
    .sort()
    .map((imported) => Object.freeze({
      imported,
      local: reserveIdentifier(reservedNames, `__v2Remotion${imported}`),
    }));
  return Object.freeze({
    adapters: Object.freeze([...adapters.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([className, adapter]) => Object.freeze({ className, adapter }))),
    componentImports: Object.freeze(componentImports),
    components: Object.freeze(Object.fromEntries(Object.entries(components).sort())),
    unitClasses: Object.freeze([...unitClasses].sort()),
  });
}

function prepareModule(input, evaluation) {
  const ast = t.cloneNode(input, true);
  const body = [];
  for (const statement of ast.program.body) {
    if (t.isImportDeclaration(statement)) { if (!evaluation) body.push(statement); continue; }
    if (t.isExportNamedDeclaration(statement)) { if (statement.declaration) body.push(statement.declaration); continue; }
    if (t.isExportDefaultDeclaration(statement)) {
      if (t.isFunctionDeclaration(statement.declaration) || t.isClassDeclaration(statement.declaration)) {
        body.push(statement.declaration);
      }
      continue;
    }
    body.push(statement);
  }
  ast.program.body = body;
  return ast;
}

function rewriteContextHooks(ast) {
  traverse(ast, {
    CallExpression(path) {
      if (isHookPath(path, 'useCurrentFrame')) {
        path.replaceWith(t.memberExpression(t.callExpression(t.identifier('__v2GetContext'), []), t.identifier('frame')));
        return;
      }
      if (isHookPath(path, 'useVideoConfig')) path.replaceWith(t.callExpression(t.identifier('__v2GetContext'), []));
    },
  });
}

function rewriteElements(ast, analysis) {
  let serial = 0;
  traverse(ast, {
    CallExpression: {
      exit(path) {
        const descriptor = analysis.targets.get(sourceKey(path.node));
        if (!descriptor) return;
        const call = path.node;
        const type = normalizeType(call.arguments[0] ?? t.stringLiteral('div'));
        const props = call.arguments[1] ?? t.nullLiteral();
        const children = call.arguments.slice(2);
        if (descriptor.behaviours.length === 0 && descriptor.unit.implementation === 'native') {
          path.replaceWith(t.newExpression(t.identifier('NativeUnit'), [type, props, ...children]));
          return;
        }
        path.replaceWith(buildClassUnit(type, props, children, descriptor, serial++));
      },
    },
  });
}

function buildClassUnit(type, props, children, descriptor, serial) {
  const typeId = t.identifier(`__v2Type${serial}`);
  const propsId = t.identifier(`__v2Props${serial}`);
  const childrenId = t.identifier(`__v2Children${serial}`);
  const unitId = t.identifier(`__v2Unit${serial}`);
  let unitProps = propsId;
  if (descriptor.behaviours.length > 0) {
    const stripArguments = [
      propsId,
      t.arrayExpression([...new Set(descriptor.stripStyleKeys)].map((key) => t.stringLiteral(key))),
    ];
    if (descriptor.promotedTransformIndexes
        && descriptor.promotedTransformIndexes.length < descriptor.transformOperationCount) {
      stripArguments.push(t.arrayExpression(
        descriptor.promotedTransformIndexes.map((index) => t.numericLiteral(index)),
      ));
    }
    unitProps = t.callExpression(t.identifier('stripVisualStyle'), stripArguments);
  }
  const childValues = children.map((_child, index) => (
    t.memberExpression(childrenId, t.numericLiteral(index), true)
  ));
  const statements = [t.variableDeclaration('const', [t.variableDeclarator(unitId,
    buildUnitExpression(descriptor.unit, typeId, unitProps, childValues, childrenId))])];
  for (const behaviour of descriptor.behaviours) {
    statements.push(t.expressionStatement(t.callExpression(
      t.memberExpression(unitId, t.identifier('addBehaviour')),
      [buildBehaviour(unitId, propsId, behaviour)],
    )));
  }
  statements.push(t.returnStatement(unitId));
  const evaluatedType = descriptor.unit.implementation === 'library'
    ? t.stringLiteral(descriptor.unit.component ?? descriptor.unit.className)
    : type;
  return t.callExpression(t.arrowFunctionExpression(
    [typeId, propsId, t.restElement(childrenId)], t.blockStatement(statements),
  ), [evaluatedType, props, ...children]);
}

function buildUnitExpression(descriptor, type, props, children, childrenId) {
  if (descriptor.implementation === 'native') {
    return t.newExpression(t.identifier('NativeUnit'), [type, props, t.spreadElement(childrenId)]);
  }
  const Constructor = t.identifier(unitAlias(descriptor.className));
  const prop = (name) => t.callExpression(t.identifier('readElementProp'), [props, t.stringLiteral(name)]);
  const style = prop('style');
  const normalizedChildren = descriptor.normalizeChildren
    ? t.callExpression(t.identifier('__v2NormalizeUnitChildren'), [childrenId])
    : null;
  if (descriptor.className === 'Box') {
    const content = normalizedChildren
      ? t.newExpression(t.identifier(unitAlias('Group')), [t.spreadElement(normalizedChildren)])
      : children.length === 1
        ? children[0]
        : t.newExpression(t.identifier(unitAlias('Group')), children);
    return t.newExpression(Constructor, [content, style]);
  }
  if (descriptor.className === 'Group') {
    return t.newExpression(Constructor, normalizedChildren
      ? [t.spreadElement(normalizedChildren)]
      : children);
  }
  if (descriptor.className === 'Layer') {
    const content = normalizedChildren
      ? t.newExpression(t.identifier(unitAlias('Group')), [t.spreadElement(normalizedChildren)])
      : children.length === 1
        ? children[0]
        : t.newExpression(t.identifier(unitAlias('Group')), children);
    return t.newExpression(Constructor, [content, style]);
  }
  if (descriptor.className === 'Text') {
    return t.newExpression(Constructor, [children[0], style]);
  }
  if (descriptor.className === 'Image') {
    return t.newExpression(Constructor, [prop('src'), t.objectExpression([
      t.objectProperty(t.identifier('alt'), t.nullLiteral()),
      t.objectProperty(t.identifier('fit'), t.nullLiteral()),
      t.objectProperty(t.identifier('appearance'), style),
    ])]);
  }
  if (descriptor.className === 'Audio') {
    return t.newExpression(Constructor, [prop('src')]);
  }
  if (descriptor.className === 'Video') {
    return t.newExpression(Constructor, [prop('src'), t.objectExpression([
      t.objectProperty(t.identifier('rate'), prop('playbackRate')),
      t.objectProperty(t.identifier('muted'), prop('muted')),
      t.objectProperty(t.identifier('transparent'), prop('transparent')),
      t.objectProperty(t.identifier('appearance'), style),
    ])]);
  }
  throw new TypeError(`Unsupported public Unit ${descriptor.className}`);
}

function appendChildNormalizer(ast, enabled, primitive) {
  if (!enabled) return;
  const primitiveBranch = primitive ? `
        else if (typeof value === "string" || typeof value === "number") {
          units.push(new __v2TextNodeUnit(value));
        }` : '';
  const declarations = parse(`
    function __v2NormalizeUnitChildren(values) {
      const units = [];
      function visit(value) {
        if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (value === null || value === undefined || typeof value === "boolean") {
          return;
        } ${primitiveBranch} else {
          units.push(value);
        }
      }
      values.forEach(visit);
      return units;
    }
  `, { sourceType: 'module' }).program.body;
  ast.program.body.unshift(...declarations);
}

function buildBehaviour(unitId, propsId, descriptor) {
  if (descriptor.implementation === 'local') {
    const values = t.objectExpression(descriptor.formula.captures.map((name) => (
      t.objectProperty(t.identifier(name), t.identifier(name), false, true)
    )));
    return t.newExpression(t.identifier(descriptor.className), [unitId, values]);
  }
  let signal;
  const options = [];
  if (descriptor.signal?.type === 'tween') {
    const value = descriptor.signal;
    signal = t.newExpression(t.identifier('Tween'), [t.callExpression(t.identifier('tweenOptions'), [
      t.numericLiteral(value.from), t.numericLiteral(value.to), t.numericLiteral(value.start),
      t.numericLiteral(value.end), t.stringLiteral(value.easing),
    ])]);
  } else if (descriptor.signal) {
    signal = emitSignalIr(descriptor.signal);
    if (descriptor.kind === 'translate' || descriptor.kind === 'rotate') {
      options.push(t.callExpression(t.identifier('unitsOption'), [t.stringLiteral(descriptor.unit)]));
    }
  } else if (descriptor.kind === 'opacity') {
    signal = t.callExpression(t.identifier('readStyleValue'), [propsId, t.stringLiteral('opacity')]);
  } else {
    const transform = t.callExpression(t.identifier('readStyleValue'), [propsId, t.stringLiteral('transform')]);
    signal = t.callExpression(t.identifier('readTransformSignal'), [
      transform, t.numericLiteral(descriptor.operationIndex), t.stringLiteral(descriptor.kind),
    ]);
    if (descriptor.kind === 'translate' || descriptor.kind === 'rotate') {
      options.push(t.callExpression(t.identifier('unitsOption'), [t.stringLiteral(descriptor.unit)]));
    }
  }
  return t.newExpression(t.identifier(descriptor.className), [unitId, signal, ...options]);
}

function emitSignalIr(signal) {
  if (signal.type === 'literal') return t.numericLiteral(signal.value);
  if (signal.type === 'context') {
    return t.newExpression(t.identifier('ContextValue'), [t.stringLiteral(signal.field)]);
  }
  if (signal.type === 'computed') {
    return t.newExpression(t.identifier('Computed'), [
      t.stringLiteral(signal.operator),
      t.arrayExpression(signal.operands.map(emitSignalIr)),
    ]);
  }
  if (signal.type === 'record') {
    return t.newExpression(t.identifier('RecordValue'), [t.arrayExpression(
      Object.entries(signal.fields).map(([key, value]) => t.arrayExpression([
        t.stringLiteral(key), emitSignalIr(value),
      ])),
    )]);
  }
  if (signal.type === 'interpolation') {
    return t.newExpression(t.identifier('Interpolation'), [t.objectExpression([
      t.objectProperty(t.identifier('input'), emitSignalIr(signal.input)),
      t.objectProperty(t.identifier('inputRange'), t.arrayExpression(
        signal.inputRange.map(emitSignalIr),
      )),
      t.objectProperty(t.identifier('outputRange'), t.arrayExpression(
        signal.outputRange.map(emitSignalIr),
      )),
      t.objectProperty(t.identifier('easing'), emitEasing(signal.easing)),
      t.objectProperty(t.identifier('extrapolateLeft'), t.stringLiteral(signal.extrapolateLeft)),
      t.objectProperty(t.identifier('extrapolateRight'), t.stringLiteral(signal.extrapolateRight)),
    ])]);
  }
  throw new TypeError(`Unsupported declarative Signal IR ${String(signal.type)}`);
}

function emitEasing(value) {
  if (typeof value === 'string') return t.stringLiteral(value);
  if (value.name === 'bezier') {
    return t.arrayExpression([
      t.stringLiteral(value.name),
      ...value.values.map((entry) => t.numericLiteral(entry)),
    ]);
  }
  return t.arrayExpression([t.stringLiteral(value.name), emitEasing(value.easing)]);
}

function appendLocalBehaviourClasses(ast, behaviours) {
  if (behaviours.length === 0) return;
  const declarations = parse(behaviours.map(localClassSource).join('\n'), { sourceType: 'module' }).program.body;
  ast.program.body.unshift(...declarations);
}

function localClassSource(descriptor) {
  const { kind, className: name } = descriptor;
  const formula = generate(descriptor.formula.expression, { comments: false }).code;
  if (kind === 'opacity') return `
    class ${name} extends Behaviour {
      static kind = "behaviour.local.opacity.${name}";
      constructor(unit, values) { super(unit); this.values = values; }
      onFrame(context) { this.unit.opacity = ${formula}; }
    }`;
  if (kind === 'scale') return `
    class ${name} extends Behaviour {
      static kind = "behaviour.local.scale.${name}";
      constructor(unit, values) { super(unit); this.values = values; }
      onFrame(context) {
        const value = readTransformSignal(${formula}, ${descriptor.operationIndex}, "scale");
        this.unit.transform = plainVisualValue({ ...(this.unit.transform ?? {}), scale: value });
      }
    }`;
  if (kind === 'translate') return `
    class ${name} extends Behaviour {
      static kind = "behaviour.local.translate.${name}";
      constructor(unit, values) { super(unit); this.values = values; }
      onFrame(context) {
        const value = readTransformSignal(${formula}, ${descriptor.operationIndex}, "translate");
        this.unit.transform = plainVisualValue({ ...(this.unit.transform ?? {}), translate: { ...value, units: ${JSON.stringify(descriptor.unit)} } });
      }
    }`;
  return `
    class ${name} extends Behaviour {
      static kind = "behaviour.local.rotate.${name}";
      constructor(unit, values) { super(unit); this.values = values; }
      onFrame(context) {
        const value = readTransformSignal(${formula}, ${descriptor.operationIndex}, "rotate");
      this.unit.transform = plainVisualValue({ ...(this.unit.transform ?? {}), rotate: { value, units: ${JSON.stringify(descriptor.unit)} } });
      }
    }`;
}

function restoreReactElements(ast) {
  traverse(ast, {
    CallExpression(path) {
      if (!t.isIdentifier(path.node.callee, { name: '__v2Element' })) return;
      path.node.callee = t.memberExpression(t.identifier('React'), t.identifier('createElement'));
      if (t.isIdentifier(path.node.arguments[0], { name: '__v2Fragment' })) {
        path.node.arguments[0] = t.memberExpression(t.identifier('React'), t.identifier('Fragment'));
      }
    },
  });
}

function appendStaticUnitRenderer(ast, rendering) {
  if (rendering.adapters.length === 0) return;
  const context = t.identifier('context');
  const statements = [];
  rendering.adapters.forEach(({ adapter }, index) => {
    const result = t.identifier(`__v2Rendered${index}`);
    statements.push(t.variableDeclaration('const', [t.variableDeclarator(
      result,
      t.callExpression(t.identifier(adapterAlias(adapter)), [context]),
    )]));
    statements.push(t.ifStatement(t.binaryExpression('!==', result,
      t.memberExpression(context, t.identifier('unhandled'))), t.returnStatement(result)));
  });
  statements.push(t.returnStatement(t.memberExpression(context, t.identifier('unhandled'))));
  ast.program.body.push(t.functionDeclaration(
    t.identifier('__v2RenderUnit'), [context], t.blockStatement(statements),
  ));
}

function appendCompositionApi(ast, entryName, exposeGlobal, rendering) {
  const contextId = t.identifier('__v2ActiveContext');
  ast.program.body.unshift(
    t.variableDeclaration('let', [t.variableDeclarator(contextId, t.objectExpression([]))]),
    t.functionDeclaration(t.identifier('__v2GetContext'), [],
      t.blockStatement([t.returnStatement(contextId)])),
  );
  const propsId = t.identifier('props');
  const nextContextId = t.identifier('context');
  ast.program.body.push(t.functionDeclaration(
    t.identifier('createCompositionUnitTree'),
    [t.assignmentPattern(propsId, t.objectExpression([])), t.assignmentPattern(nextContextId, t.objectExpression([]))],
    t.blockStatement([
      t.expressionStatement(t.assignmentExpression('=', contextId, t.objectExpression([
        t.objectProperty(t.identifier('frame'), t.numericLiteral(0)),
        t.objectProperty(t.identifier('fps'), t.numericLiteral(60)),
        t.spreadElement(nextContextId),
      ]))),
      t.returnStatement(t.callExpression(t.identifier(entryName), [propsId])),
    ]),
  ));
  if (exposeGlobal) {
    ast.program.body.push(t.expressionStatement(t.assignmentExpression('=',
      t.memberExpression(t.identifier('globalThis'), t.identifier('__composition')),
      t.identifier('createCompositionUnitTree'))));
  } else {
    const renderOptions = t.identifier('options');
    const componentAliases = new Map(rendering.componentImports.map(({ imported, local }) => (
      [imported, local]
    )));
    const defaultComponents = t.objectExpression(Object.entries(rendering.components).map(([name, value]) => (
      t.objectProperty(t.identifier(name), t.identifier(componentAliases.get(value)))
    )));
    const suppliedComponents = t.logicalExpression('??',
      t.memberExpression(renderOptions, t.identifier('components')), t.objectExpression([]));
    const optionsObject = t.objectExpression([
      t.objectProperty(t.identifier('components'), t.objectExpression([
        t.spreadElement(defaultComponents),
        t.spreadElement(suppliedComponents),
      ])),
      t.objectProperty(t.identifier('adaptProps'),
        t.memberExpression(renderOptions, t.identifier('adaptProps'))),
      t.objectProperty(t.identifier('renderSequence'),
        t.memberExpression(renderOptions, t.identifier('renderSequence'))),
    ]);
    ast.program.body.push(t.functionDeclaration(
      t.identifier('renderGeneratedComposition'),
      [t.identifier('React'), t.assignmentPattern(t.identifier('props'), t.objectExpression([])),
        t.assignmentPattern(t.identifier('context'), t.objectExpression([])),
        t.assignmentPattern(renderOptions, t.objectExpression([]))],
      t.blockStatement([t.returnStatement(t.callExpression(t.identifier('renderNativeTree'), [
        t.callExpression(t.identifier('createCompositionUnitTree'), [t.identifier('props'), t.identifier('context')]),
        t.identifier('React'), t.identifier('context'),
        rendering.adapters.length > 0 ? t.identifier('__v2RenderUnit') : t.nullLiteral(),
        optionsObject,
      ]))]),
    ));
    ast.program.body.push(t.exportNamedDeclaration(null, [
      t.exportSpecifier(t.identifier('createCompositionUnitTree'), t.identifier('createCompositionUnitTree')),
      t.exportSpecifier(t.identifier('renderGeneratedComposition'), t.identifier('renderGeneratedComposition')),
    ]));
  }
}

function buildImportHeader(imports, classNames, {
  localBehaviours, rendering, runtimeUsage, signalClassNames, usesTween,
}) {
  const runtimeNames = ['renderNativeTree'];
  if (runtimeUsage.nativeUnit) runtimeNames.push('NativeUnit');
  if (runtimeUsage.plainVisual) runtimeNames.push('plainVisualValue');
  if (runtimeUsage.fragment) runtimeNames.push('NATIVE_FRAGMENT');
  if (runtimeUsage.propRead) runtimeNames.push('readElementProp');
  if (runtimeUsage.styleRead) runtimeNames.push('readStyleValue');
  if (runtimeUsage.transformRead) runtimeNames.push('readTransformSignal');
  if (runtimeUsage.stripStyle) runtimeNames.push('stripVisualStyle');
  if (runtimeUsage.tweenOptions) runtimeNames.push('tweenOptions');
  if (runtimeUsage.unitsOption) runtimeNames.push('unitsOption');
  runtimeNames.sort();
  const lines = [`import { ${runtimeNames.join(', ')} } from ${JSON.stringify(imports.runtime)};`];
  if (rendering.componentImports.length > 0) {
    const specifiers = rendering.componentImports.map(({ imported, local }) => (
      imported === local ? imported : `${imported} as ${local}`
    ));
    lines.push(`import { ${specifiers.join(', ')} } from ${JSON.stringify(imports.remotion)};`);
  }
  if (localBehaviours.length > 0) lines.push(`import { Behaviour } from ${JSON.stringify(imports.Behaviour)};`);
  const signalImports = [...signalClassNames, ...(usesTween ? ['Tween'] : [])].sort();
  if (signalImports.length > 0) {
    lines.push(`import { ${signalImports.join(', ')} } from ${JSON.stringify(imports.signals)};`);
  }
  for (const className of classNames) lines.push(`import { ${className} } from ${JSON.stringify(imports[className])};`);
  for (const className of rendering.unitClasses) {
    lines.push(`import { ${className} as ${unitAlias(className)} } from ${JSON.stringify(imports[className])};`);
  }
  for (const { adapter } of rendering.adapters) {
    lines.push(`import { ${adapter} as ${adapterAlias(adapter)} } from ${JSON.stringify(imports[adapter])};`);
  }
  return lines;
}

function linkStaticExternals(program, imports) {
  let ast;
  try {
    ast = parse(program, { sourceType: 'module', plugins: ['typescript'] });
  } catch {
    return {
      program,
      dynamicImportCount: 1,
      staticExternalImportCount: 0,
      unresolvedExternalCount: 1,
    };
  }
  const unbound = new Set();
  let dynamicImportCount = 0;
  traverse(ast, {
    enter(path) {
      if (path.node.type === 'ImportExpression'
          || (t.isCallExpression(path.node) && path.node.callee?.type === 'Import')) {
        dynamicImportCount += 1;
      }
    },
    ReferencedIdentifier(path) {
      const name = path.node.name;
      if (!path.scope.hasBinding(name) && !PLATFORM_GLOBALS.has(name)) unbound.add(name);
    },
  });
  const namespaceImports = [];
  const namedByModule = new Map();
  const unresolved = [];
  for (const name of [...unbound].sort()) {
    const namespaceModule = STATIC_NAMESPACE_EXTERNALS[name];
    if (namespaceModule) {
      namespaceImports.push({ local: name, module: namespaceModule });
      continue;
    }
    const namedModule = STATIC_NAMED_EXTERNALS[name];
    if (namedModule) {
      const names = namedByModule.get(namedModule) ?? [];
      names.push(name);
      namedByModule.set(namedModule, names);
      continue;
    }
    unresolved.push(name);
  }
  const lines = namespaceImports
    .sort((left, right) => left.module.localeCompare(right.module) || left.local.localeCompare(right.local))
    .map(({ local, module }) => `import * as ${local} from ${JSON.stringify(imports[module])};`);
  for (const [module, names] of [...namedByModule].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`import { ${names.sort().join(', ')} } from ${JSON.stringify(imports[module])};`);
  }
  return {
    program: lines.length > 0 ? `${lines.join('\n')}\n${program}` : program,
    dynamicImportCount,
    staticExternalImportCount: namespaceImports.length
      + [...namedByModule.values()].reduce((total, names) => total + names.length, 0),
    unresolvedExternalCount: unresolved.length,
  };
}

function normalizeType(value) {
  return t.isIdentifier(value, { name: '__v2Fragment' }) ? t.identifier('NATIVE_FRAGMENT') : value;
}
function unitAlias(className) { return `__v2${className}Unit`; }
function adapterAlias(name) { return `__v2${name[0].toUpperCase()}${name.slice(1)}`; }
function componentRole(className) { return className[0].toLowerCase() + className.slice(1); }
function collectIdentifierNames(ast) {
  const names = new Set();
  traverse(ast, {
    Identifier(path) { names.add(path.node.name); },
  });
  return names;
}
function reserveIdentifier(names, base) {
  let candidate = base;
  let suffix = 2;
  while (names.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  names.add(candidate);
  return candidate;
}
function isHook(callee, name) {
  return t.isIdentifier(callee, { name }) || (t.isMemberExpression(callee) && !callee.computed
    && t.isIdentifier(callee.property, { name }));
}
function isHookPath(path, name) {
  const callee = path.node.callee;
  if (!isHook(callee, name)) return false;
  if (t.isIdentifier(callee)) {
    const binding = path.scope.getBinding(callee.name);
    return !binding || binding.kind === 'module';
  }
  if (!t.isIdentifier(callee.object)) return true;
  const binding = path.scope.getBinding(callee.object.name);
  return !binding || binding.kind === 'module';
}
