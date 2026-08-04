import generateModule from '@babel/generator';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

import { sourceKey } from './analyzer.js';

const generate = generateModule.default ?? generateModule;
const traverse = traverseModule.default ?? traverseModule;
const DEFAULT_IMPORTS = Object.freeze({
  runtime: './runtime/index.js',
  Behaviour: '../../core/Behaviour.js',
  signals: '../../core/signals.js',
  Opacity: '../../behaviours/opacity.js',
  Scale: '../../behaviours/scale.js',
  Translate: '../../behaviours/translate.js',
  Rotate: '../../behaviours/rotate.js',
});

/** Emit both the publishable ESM module and import-free verifier programs. */
export function emitComposition(parsed, analysis, options = {}) {
  const imports = { ...DEFAULT_IMPORTS, ...(options.imports ?? {}) };
  const allBehaviours = [...analysis.targets.values()].flatMap((target) => target.behaviours);
  const localBehaviours = allBehaviours.filter((item) => item.implementation === 'local');
  const classNames = [...new Set(analysis.inventory.behaviours
    .filter((item) => item.implementation === 'library').map((item) => item.className))];
  const usesTween = analysis.inventory.behaviours.some((item) => item.signal?.type === 'tween');
  const runtimeUsage = {
    fragment: analysis.inventory.units.some((item) => item.tag === 'fragment'),
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
  appendLocalBehaviourClasses(cbaAst, localBehaviours);
  appendCompositionApi(cbaAst, analysis.entryName, false);
  const body = generate(cbaAst, { comments: false, compact: false, jsescOption: { minimal: true } }).code;
  const header = buildImportHeader(imports, classNames, { localBehaviours, runtimeUsage, usesTween });
  const program = `${header.join('\n')}\n${body}\n`;

  let generatedParse = true;
  let generatedParseError = null;
  try { parse(program, { sourceType: 'module', plugins: ['typescript'] }); }
  catch (error) { generatedParse = false; generatedParseError = error?.name ?? 'ParseError'; }

  const cbaEvaluationAst = prepareModule(parsed.ast, true);
  rewriteContextHooks(cbaEvaluationAst);
  rewriteElements(cbaEvaluationAst, analysis);
  appendLocalBehaviourClasses(cbaEvaluationAst, localBehaviours);
  appendCompositionApi(cbaEvaluationAst, analysis.entryName, true);

  const baselineAst = prepareModule(parsed.ast, true);
  rewriteContextHooks(baselineAst);
  restoreReactElements(baselineAst);
  appendCompositionApi(baselineAst, analysis.entryName, true);

  return {
    program,
    verification: {
      generatedParse,
      generatedParseError,
      concreteClassImports: Object.freeze(['NativeUnit', ...classNames, ...(usesTween ? ['Tween'] : [])]),
      localBehaviourClasses: Object.freeze(localBehaviours.map((item) => item.className)),
      classUnitCount: analysis.inventory.units.length,
      atomicBehaviourCount: analysis.inventory.behaviours.length,
    },
    evaluationPrograms: {
      baseline: generate(baselineAst, { comments: false }).code,
      cba: generate(cbaEvaluationAst, { comments: false }).code,
    },
  };
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
        if (descriptor.behaviours.length === 0) {
          path.replaceWith(t.newExpression(t.identifier('NativeUnit'), [type, props, ...children]));
          return;
        }
        path.replaceWith(buildDecoratedUnit(type, props, children, descriptor, serial++));
      },
    },
  });
}

function buildDecoratedUnit(type, props, children, descriptor, serial) {
  const typeId = t.identifier(`__v2Type${serial}`);
  const propsId = t.identifier(`__v2Props${serial}`);
  const childrenId = t.identifier(`__v2Children${serial}`);
  const unitId = t.identifier(`__v2Unit${serial}`);
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
  const strippedProps = t.callExpression(t.identifier('stripVisualStyle'), stripArguments);
  const statements = [t.variableDeclaration('const', [t.variableDeclarator(unitId,
    t.newExpression(t.identifier('NativeUnit'), [typeId, strippedProps, t.spreadElement(childrenId)]))])];
  for (const behaviour of descriptor.behaviours) {
    statements.push(t.expressionStatement(t.callExpression(
      t.memberExpression(unitId, t.identifier('addBehaviour')),
      [buildBehaviour(unitId, propsId, behaviour)],
    )));
  }
  statements.push(t.returnStatement(unitId));
  return t.callExpression(t.arrowFunctionExpression(
    [typeId, propsId, t.restElement(childrenId)], t.blockStatement(statements),
  ), [type, props, ...children]);
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
        this.unit.transform = { ...(this.unit.transform ?? {}), scale: value };
      }
    }`;
  if (kind === 'translate') return `
    class ${name} extends Behaviour {
      static kind = "behaviour.local.translate.${name}";
      constructor(unit, values) { super(unit); this.values = values; }
      onFrame(context) {
        const value = readTransformSignal(${formula}, ${descriptor.operationIndex}, "translate");
        this.unit.transform = { ...(this.unit.transform ?? {}), translate: { ...value, units: ${JSON.stringify(descriptor.unit)} } };
      }
    }`;
  return `
    class ${name} extends Behaviour {
      static kind = "behaviour.local.rotate.${name}";
      constructor(unit, values) { super(unit); this.values = values; }
      onFrame(context) {
        const value = readTransformSignal(${formula}, ${descriptor.operationIndex}, "rotate");
        this.unit.transform = { ...(this.unit.transform ?? {}), rotate: { value, units: ${JSON.stringify(descriptor.unit)} } };
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

function appendCompositionApi(ast, entryName, exposeGlobal) {
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
    ast.program.body.push(t.functionDeclaration(
      t.identifier('renderGeneratedComposition'),
      [t.identifier('React'), t.assignmentPattern(t.identifier('props'), t.objectExpression([])),
        t.assignmentPattern(t.identifier('context'), t.objectExpression([]))],
      t.blockStatement([t.returnStatement(t.callExpression(t.identifier('renderNativeTree'), [
        t.callExpression(t.identifier('createCompositionUnitTree'), [t.identifier('props'), t.identifier('context')]),
        t.identifier('React'), t.identifier('context'),
      ]))]),
    ));
    ast.program.body.push(t.exportNamedDeclaration(null, [
      t.exportSpecifier(t.identifier('createCompositionUnitTree'), t.identifier('createCompositionUnitTree')),
      t.exportSpecifier(t.identifier('renderGeneratedComposition'), t.identifier('renderGeneratedComposition')),
    ]));
  }
}

function buildImportHeader(imports, classNames, { localBehaviours, runtimeUsage, usesTween }) {
  const runtimeNames = ['NativeUnit', 'renderNativeTree'];
  if (runtimeUsage.fragment) runtimeNames.push('NATIVE_FRAGMENT');
  if (runtimeUsage.styleRead) runtimeNames.push('readStyleValue');
  if (runtimeUsage.transformRead) runtimeNames.push('readTransformSignal');
  if (runtimeUsage.stripStyle) runtimeNames.push('stripVisualStyle');
  if (runtimeUsage.tweenOptions) runtimeNames.push('tweenOptions');
  if (runtimeUsage.unitsOption) runtimeNames.push('unitsOption');
  runtimeNames.sort();
  const lines = [`import { ${runtimeNames.join(', ')} } from ${JSON.stringify(imports.runtime)};`];
  if (localBehaviours.length > 0) lines.push(`import { Behaviour } from ${JSON.stringify(imports.Behaviour)};`);
  if (usesTween) lines.push(`import { Tween } from ${JSON.stringify(imports.signals)};`);
  for (const className of classNames) lines.push(`import { ${className} } from ${JSON.stringify(imports[className])};`);
  return lines;
}

function normalizeType(value) {
  return t.isIdentifier(value, { name: '__v2Fragment' }) ? t.identifier('NATIVE_FRAGMENT') : value;
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
