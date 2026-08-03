import { transformFromAstSync } from '@babel/core';
import generateModule from '@babel/generator';
import { parse } from '@babel/parser';
import jsxPluginModule from '@babel/plugin-transform-react-jsx';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

import { sha256 } from '../lib.js';
import { parseComposition } from '../normalize.js';

const generate = generateModule.default ?? generateModule;
const traverse = traverseModule.default ?? traverseModule;
const jsxPlugin = jsxPluginModule.default ?? jsxPluginModule;
const RUNTIME = '__cba';

const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'clipPath', 'mask', 'filter', 'feGaussianBlur',
  'feColorMatrix', 'linearGradient', 'radialGradient', 'stop', 'pattern',
  'foreignObject', 'use', 'symbol', 'marker',
]);
const TEXT_TAGS = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em']);
const IMAGE_TAGS = new Set(['img', 'Img', 'DreiImage', 'AnimatedImage']);
const VIDEO_TAGS = new Set(['video', 'Video', 'OffthreadVideo']);
const AUDIO_TAGS = new Set(['audio', 'Audio']);
const TIMELINE_TAGS = new Set(['Sequence', 'Series', 'Series.Sequence', 'TransitionSeries', 'TransitionSeries.Sequence']);
const THREE_ROOT_TAGS = new Set(['ThreeCanvas', 'Canvas']);
const THREE_HINTS = new Set([
  'mesh', 'group', 'primitive', 'ambientLight', 'directionalLight', 'pointLight',
  'spotLight', 'hemisphereLight', 'perspectiveCamera', 'orthographicCamera',
  'boxGeometry', 'sphereGeometry', 'planeGeometry', 'torusGeometry',
  'torusKnotGeometry', 'cylinderGeometry', 'coneGeometry', 'ringGeometry',
  'bufferGeometry', 'meshBasicMaterial', 'meshStandardMaterial',
  'meshPhysicalMaterial', 'shaderMaterial', 'Text3D', 'Sparkles', 'Float',
  'Stars', 'Cloud', 'Sky', 'Environment', 'ContactShadows', 'OrbitControls',
  'PerspectiveCamera', 'OrthographicCamera', 'Billboard', 'Backdrop', 'RoundedBox',
  'Box', 'Sphere', 'Plane', 'Torus', 'TorusKnot', 'Cylinder', 'Cone', 'Ring',
  'Circle', 'GradientTexture', 'MeshDistortMaterial', 'MeshWobbleMaterial',
  'MeshTransmissionMaterial', 'MeshReflectorMaterial', 'Line',
]);
const CONTROL_TYPES = new Set([
  'IfStatement', 'SwitchStatement', 'ConditionalExpression', 'LogicalExpression',
  'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement',
  'DoWhileStatement',
]);

export function compileComposition(source, options = {}) {
  const { ast: parsedAst } = parseComposition(source);
  const originalAst = structuredClone(parsedAst);
  const instrumentedAst = structuredClone(parsedAst);
  const inventory = instrumentComposition(instrumentedAst);

  const restored = restoreInstrumentation(structuredClone(instrumentedAst));
  const preLoweringEquivalent = exactAstHash(restored) === exactAstHash(originalAst);

  renameComposition(originalAst);
  renameComposition(instrumentedAst);
  const baseline = lowerJsx(originalAst, `${RUNTIME}.unitRaw`);
  const lowered = lowerJsx(instrumentedAst, `${RUNTIME}.template`);
  const mappedTemplates = injectTemplateIds(lowered.ast, inventory.templatesByStart);
  const emittedUnits = mappedTemplates + inventory.units.filter(
    (unit) => ['react-create-element', 'control'].includes(unit.origin) && unit.instrumented,
  ).length;
  const normalizedLowered = normalizeLoweredAst(structuredClone(lowered.ast));
  const loweredEquivalent = exactAstHash(normalizedLowered) === exactAstHash(baseline.ast);

  const body = generate(lowered.ast, {
    comments: false,
    compact: false,
    jsescOption: { minimal: true },
  }).code;
  const baselineBody = generate(baseline.ast, {
    comments: false,
    compact: false,
    jsescOption: { minimal: true },
  }).code;
  const unitCounts = countBy(inventory.units.map((unit) => unit.factoryId));
  const behaviourCounts = countBy(
    inventory.behaviourSinks.flatMap((sink) => sink.behaviourIds),
  );
  const runtimeImport = options.runtimeImport ?? '../../../../core/runtime.js';
  const factoryHeader = buildFactoryHeader(unitCounts, behaviourCounts, options);
  const program = [
    `import { createRuntime } from ${JSON.stringify(runtimeImport)};`,
    ...factoryHeader,
    `const ${RUNTIME} = createRuntime({ unitFactories, behaviourFactories, strict: true });`,
    body,
    `const GeneratedComposition = (...args) => ${RUNTIME}.render(${RUNTIME}.finish(createCompositionUnitTree(...args)));`,
    'export { createCompositionUnitTree, GeneratedComposition };',
    '',
  ].join('\n');

  let generatedParse = true;
  let generatedParseError = null;
  try {
    parse(program, {
      sourceType: 'module',
      plugins: ['typescript'],
    });
  } catch (error) {
    generatedParse = false;
    generatedParseError = String(error.message ?? error);
  }

  const coveredBehaviourSinks = inventory.behaviourSinks.filter((sink) => sink.instrumented).length;
  const verification = {
    preLoweringEquivalent,
    loweredEquivalent,
    generatedParse,
    generatedParseError,
    jsxUnits: {
      expected: inventory.units.length,
      emitted: emittedUnits,
      complete: inventory.units.length === emittedUnits,
    },
    visualSinks: {
      expected: inventory.behaviourSinks.length,
      emitted: coveredBehaviourSinks,
      atomicBehaviours: inventory.behaviourSinks.reduce(
        (sum, sink) => sum + sink.behaviourIds.length,
        0,
      ),
      complete: inventory.behaviourSinks.length === coveredBehaviourSinks,
    },
    controls: {
      expected: inventory.controls,
      preservedByAstRoundTrip: loweredEquivalent,
    },
  };
  verification.structuralTransformExact = Object.values({
    preLoweringEquivalent,
    loweredEquivalent,
    generatedParse,
    units: verification.jsxUnits.complete,
    sinks: verification.visualSinks.complete,
  }).every(Boolean);

  return {
    sourceHash: sha256(source),
    program,
    inventory: publicInventory(inventory),
    verification,
    factories: {
      units: unitCounts,
      behaviours: behaviourCounts,
    },
    evaluationPrograms: {
      baseline: `${baselineBody}\nglobalThis.__composition = createCompositionUnitTree;`,
      cba: `${body}\nglobalThis.__composition = createCompositionUnitTree;`,
      externalComponents: inventory.units
        .filter((unit) => unit.componentKind === 'external')
        .map((unit) => unit.tag),
    },
  };
}

function buildFactoryHeader(unitCounts, behaviourCounts, options) {
  if (!options.factoryModules) {
    const libraryImport = options.libraryImport ?? '../../../../cba-runs/current/index.generated.js';
    return [`import { unitFactories, behaviourFactories } from ${JSON.stringify(libraryImport)};`];
  }
  const lines = [];
  const unitEntries = [];
  const behaviourEntries = [];
  Object.keys(unitCounts).sort().forEach((id, index) => {
    const alias = `__unitFactory${index}`;
    const modulePath = options.factoryModules.units[id];
    if (!modulePath) throw new Error(`Missing unit factory module for ${id}`);
    lines.push(`import * as ${alias} from ${JSON.stringify(modulePath)};`);
    unitEntries.push(`[${alias}.id, ${alias}]`);
  });
  Object.keys(behaviourCounts).sort().forEach((id, index) => {
    const alias = `__behaviourFactory${index}`;
    const modulePath = options.factoryModules.behaviours[id];
    if (!modulePath) throw new Error(`Missing behaviour factory module for ${id}`);
    lines.push(`import * as ${alias} from ${JSON.stringify(modulePath)};`);
    behaviourEntries.push(`[${alias}.id, ${alias}]`);
  });
  lines.push(`const unitFactories = new Map([${unitEntries.join(', ')}]);`);
  lines.push(`const behaviourFactories = new Map([${behaviourEntries.join(', ')}]);`);
  return lines;
}

export function instrumentComposition(ast) {
  const dynamicBindings = findFrameDependentBindings(ast);
  const reachableBindings = findReachableBindings(ast);
  const templatesByStart = new Map();
  const units = [];
  const behaviourSinks = [];
  const expressionTargets = new WeakMap();
  const effectTargets = new WeakMap();
  const elementTargets = new WeakMap();
  const controlTargets = new WeakMap();
  let controls = 0;

  // Census is intentionally separate from rewriting. This prevents a broad
  // content wrapper from hiding nested JSX sinks and gives verification an
  // origin set produced before instrumentation exists.
  traverse(ast, {
    enter(path) {
      if (isReachablePath(path, reachableBindings) && CONTROL_TYPES.has(path.node.type)) {
        controls += 1;
      }
    },

    CallExpression(path) {
      if (!isReachablePath(path, reachableBindings)) return;
      if (isMapCall(path.node)) controls += 1;
      if (isReactCreateElementCall(path.node.callee) && path.node.arguments.length >= 1) {
        const tag = createElementTag(path.node.arguments[0]);
        const descriptor = describeUnit(path, tag);
        const record = {
          start: path.node.start,
          tag,
          ...descriptor,
          origin: 'react-create-element',
          instrumented: false,
        };
        units.push(record);
        elementTargets.set(path.node, { record });
        analyzeCreateElementSinks({
          path,
          backend: descriptor.backend,
          dynamicBindings,
          expressionTargets,
          behaviourSinks,
        });
      }
      if (isUseEffectCall(path.node.callee) && path.node.arguments.length >= 1) {
        const setupPath = path.get('arguments.0');
        if (pathIsFrameDependent(setupPath, dynamicBindings)) {
          const backend = classifyEffectBackend(setupPath, ast);
          const descriptor = backend === 'canvas'
            ? { id: 'behaviour.canvas.draw', channel: 'canvas-draw', backend }
            : backend === 'three'
              ? { id: 'behaviour.three.effect', channel: 'three-effect', backend }
              : { id: 'behaviour.lifecycle.effect', channel: 'lifecycle', backend };
          const sink = registerSink(behaviourSinks, path.node, [descriptor], descriptor);
          effectTargets.set(path.node, { descriptor, sinkIndexes: [sink] });
        }
      }
    },

    JSXElement(path) {
      if (!isReachablePath(path, reachableBindings)) return;
      const tag = jsxName(path.node.openingElement.name);
      const descriptor = describeUnit(path, tag);
      const record = {
        start: path.node.start,
        tag,
        ...descriptor,
      };
      units.push(record);
      templatesByStart.set(path.node.start, record.factoryId);
    },

    JSXFragment(path) {
      if (!isReachablePath(path, reachableBindings)) return;
      const record = {
        start: path.node.start,
        tag: 'Fragment',
        backend: nearestBackend(path),
        componentKind: 'fragment',
        factoryId: 'unit.react.fragment',
      };
      units.push(record);
      templatesByStart.set(path.node.start, record.factoryId);
    },

    JSXAttribute(path) {
      if (!isReachablePath(path, reachableBindings)) return;
      const valuePath = path.get('value');
      if (!valuePath.isJSXExpressionContainer()) return;
      const expressionPath = valuePath.get('expression');
      if (expressionPath.isJSXEmptyExpression()) return;
      const name = jsxName(path.node.name);
      const backend = nearestBackend(path);

      if (name === 'style' && expressionPath.isObjectExpression()) {
        for (const propertyPath of expressionPath.get('properties')) {
          if (propertyPath.isObjectProperty()) {
            const nestedPath = propertyPath.get('value');
            if (!pathIsFrameDependent(nestedPath, dynamicBindings)) continue;
            const property = objectPropertyName(propertyPath.node.key);
            const descriptors = styleDescriptors(property, nestedPath.node);
            const sink = registerSink(behaviourSinks, nestedPath.node, descriptors, {
              channel: descriptors[0].channel,
              property,
              backend,
            });
            expressionTargets.set(nestedPath.node, {
              method: 'value', descriptors, sinkIndexes: [sink],
            });
          } else if (
            propertyPath.isSpreadElement()
            && pathIsFrameDependent(propertyPath.get('argument'), dynamicBindings)
          ) {
            const id = 'behaviour.css.properties';
            const descriptor = { id, channel: 'property', property: 'style' };
            const sink = registerSink(behaviourSinks, propertyPath.node, [descriptor], {
              channel: 'property', property: 'style', backend,
            });
            expressionTargets.set(propertyPath.node.argument, {
              method: 'spread', descriptors: [descriptor], sinkIndexes: [sink],
            });
          }
        }
        return;
      }

      if (!pathIsFrameDependent(expressionPath, dynamicBindings)) return;
      if (name === 'style') {
        const resolved = resolveStyleObject(expressionPath, dynamicBindings);
        if (resolved.length > 0) {
          const sinkIndexes = resolved.map(({ descriptors, property }) => (
            registerSink(behaviourSinks, expressionPath.node, descriptors, {
              channel: descriptors[0].channel,
              property,
              backend,
            })
          ));
          expressionTargets.set(expressionPath.node, {
            method: 'object',
            descriptors: resolved.flatMap(({ descriptors, property }) => (
              descriptors.map((descriptor) => ({ ...descriptor, property }))
            )),
            sinkIndexes,
          });
          return;
        }
      }
      const descriptors = attributeDescriptors(name, backend, expressionPath.node);
      const sink = registerSink(behaviourSinks, expressionPath.node, descriptors, {
        channel: descriptors[0].channel,
        property: name,
        backend,
      });
      expressionTargets.set(expressionPath.node, {
        method: 'value', descriptors, sinkIndexes: [sink],
      });
    },

    JSXSpreadAttribute(path) {
      if (!isReachablePath(path, reachableBindings)) return;
      const argumentPath = path.get('argument');
      if (!pathIsFrameDependent(argumentPath, dynamicBindings)) return;
      const backend = nearestBackend(path);
      const id = `behaviour.${backend === 'three' ? 'three' : backend === 'svg' ? 'svg' : 'dom'}.properties`;
      const descriptor = { id, channel: backend === 'three' ? 'three-property' : 'attribute' };
      const sink = registerSink(behaviourSinks, path.node, [descriptor], {
        channel: 'properties', backend,
      });
      expressionTargets.set(argumentPath.node, {
        method: 'spread', descriptors: [descriptor], sinkIndexes: [sink],
      });
    },

    JSXExpressionContainer(path) {
      if (!isReachablePath(path, reachableBindings)) return;
      if (path.parentPath.isJSXAttribute()) return;
      if (!path.parentPath.isJSXElement() && !path.parentPath.isJSXFragment()) return;
      const expressionPath = path.get('expression');
      if (expressionPath.isJSXEmptyExpression()) return;
      const controlKind = childControlKind(expressionPath);
      if (controlKind) {
        const factoryId = `unit.control.${controlKind}`;
        const record = {
          start: expressionPath.node.start,
          tag: controlKind === 'repeat' ? 'Repeat' : 'Switch',
          backend: 'react',
          componentKind: 'fragment',
          factoryId,
          origin: 'control',
          instrumented: false,
        };
        units.push(record);
        controlTargets.set(expressionPath.node, { record, method: controlKind });
        return;
      }
      if (!pathIsFrameDependent(expressionPath, dynamicBindings)) return;
      const descriptors = [{ id: 'behaviour.content.value', channel: 'content' }];
      const sink = registerSink(behaviourSinks, expressionPath.node, descriptors, {
        channel: 'content', backend: nearestBackend(path),
      });
      expressionTargets.set(expressionPath.node, {
        method: 'value', descriptors, sinkIndexes: [sink],
      });
    },
  });

  // Rewrite post-order. Leaf style/attribute expressions are wrapped before
  // an enclosing map/conditional content expression.
  traverse(ast, {
    CallExpression: {
      exit(path) {
        const target = effectTargets.get(path.node);
        if (target) {
          effectTargets.delete(path.node);
          const originalCallee = path.node.callee;
          const originalArguments = path.node.arguments;
          path.replaceWith(t.callExpression(runtimeMember('effect'), [
            t.stringLiteral(target.descriptor.id),
            originalCallee,
            t.arrayExpression(originalArguments),
            t.valueToNode({
              ...target.descriptor,
              origins: target.sinkIndexes.map((index) => behaviourSinks[index].origin),
              __cbaWrapper: 'effect',
            }),
          ]));
          markInstrumented(behaviourSinks, target.sinkIndexes);
          return;
        }
        const elementTarget = elementTargets.get(path.node);
        if (!elementTarget) return;
        elementTargets.delete(path.node);
        const originalCallee = path.node.callee;
        const originalArguments = path.node.arguments;
        path.replaceWith(t.callExpression(runtimeMember('element'), [
          t.stringLiteral(elementTarget.record.factoryId),
          originalCallee,
          t.arrayExpression(originalArguments),
        ]));
        elementTarget.record.instrumented = true;
      },
    },
    Expression: {
      exit(path) {
        const controlTarget = controlTargets.get(path.node);
        if (controlTarget) {
          controlTargets.delete(path.node);
          const original = path.node;
          path.replaceWith(t.callExpression(runtimeMember(controlTarget.method), [
            t.stringLiteral(controlTarget.record.factoryId),
            t.arrowFunctionExpression([], original),
          ]));
          controlTarget.record.instrumented = true;
          return;
        }
        const target = expressionTargets.get(path.node);
        if (!target) return;
        expressionTargets.delete(path.node);
        wrapTargetExpression(path, target, behaviourSinks);
      },
    },
  });

  return { units, behaviourSinks, controls, templatesByStart };
}

function analyzeCreateElementSinks({
  path,
  backend,
  dynamicBindings,
  expressionTargets,
  behaviourSinks,
}) {
  const argumentPaths = path.get('arguments');
  const propsPath = argumentPaths[1];
  if (propsPath?.isObjectExpression()) {
    for (const propertyPath of propsPath.get('properties')) {
      if (!propertyPath.isObjectProperty()) continue;
      const name = objectPropertyName(propertyPath.node.key);
      const valuePath = propertyPath.get('value');
      if (name === 'style' && valuePath.isObjectExpression()) {
        for (const stylePropertyPath of valuePath.get('properties')) {
          if (!stylePropertyPath.isObjectProperty()) continue;
          const nestedPath = stylePropertyPath.get('value');
          if (!pathIsFrameDependent(nestedPath, dynamicBindings)) continue;
          const property = objectPropertyName(stylePropertyPath.node.key);
          const descriptors = styleDescriptors(property, nestedPath.node);
          const sink = registerSink(behaviourSinks, nestedPath.node, descriptors, {
            channel: descriptors[0].channel, property, backend,
          });
          expressionTargets.set(nestedPath.node, {
            method: 'value', descriptors, sinkIndexes: [sink],
          });
        }
      } else if (pathIsFrameDependent(valuePath, dynamicBindings)) {
        const descriptors = attributeDescriptors(name, backend, valuePath.node);
        const sink = registerSink(behaviourSinks, valuePath.node, descriptors, {
          channel: descriptors[0].channel, property: name, backend,
        });
        expressionTargets.set(valuePath.node, {
          method: 'value', descriptors, sinkIndexes: [sink],
        });
      }
    }
  }
  for (const childPath of argumentPaths.slice(2)) {
    if (!pathIsFrameDependent(childPath, dynamicBindings)) continue;
    const descriptors = [{ id: 'behaviour.content.value', channel: 'content' }];
    const sink = registerSink(behaviourSinks, childPath.node, descriptors, {
      channel: 'content', backend,
    });
    expressionTargets.set(childPath.node, {
      method: 'value', descriptors, sinkIndexes: [sink],
    });
  }
}

function registerSink(output, node, descriptors, metadata) {
  const index = output.length;
  output.push({
    origin: `sink-${String(index + 1).padStart(4, '0')}`,
    start: node?.start ?? null,
    end: node?.end ?? null,
    behaviourIds: descriptors.map((descriptor) => descriptor.id),
    channel: metadata.channel,
    property: metadata.property ?? null,
    backend: metadata.backend ?? null,
    instrumented: false,
  });
  return index;
}

function childControlKind(expressionPath) {
  if (isMapCall(expressionPath.node)) return 'repeat';
  if (
    expressionPath.isConditionalExpression()
    || expressionPath.isLogicalExpression()
  ) return subtreeContainsJsx(expressionPath) ? 'switch' : null;
  return null;
}

function isMapCall(node) {
  if (node?.type !== 'CallExpression') return false;
  if (
    node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.property?.type === 'Identifier'
    && node.callee.property.name === 'map'
  ) return true;
  return calleeName(node.callee) === 'Array.from' && node.arguments.length >= 2;
}

function subtreeContainsJsx(path) {
  let found = false;
  path.traverse({
    JSXElement(nested) { found = true; nested.stop(); },
    JSXFragment(nested) { found = true; nested.stop(); },
  });
  return found;
}

function findReachableBindings(ast) {
  let root;
  traverse(ast, {
    Program(path) {
      root = path.scope.getBinding('GeneratedComposition');
      path.stop();
    },
  });
  if (!root) throw new Error('GeneratedComposition binding was not found');
  const reachable = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const binding = queue.shift();
    binding.path.traverse({
      ReferencedIdentifier(path) {
        const dependency = path.scope.getBinding(path.node.name);
        if (dependency && !reachable.has(dependency)) {
          reachable.add(dependency);
          queue.push(dependency);
        }
      },
      JSXIdentifier(path) {
        if (/^[a-z]/.test(path.node.name)) return;
        const dependency = path.scope.getBinding(path.node.name);
        if (dependency && !reachable.has(dependency)) {
          reachable.add(dependency);
          queue.push(dependency);
        }
      },
    });
  }
  return reachable;
}

function isReachablePath(path, reachableBindings) {
  let current = path;
  while (current) {
    if (current.isFunction?.()) {
      const binding = bindingForFunction(current);
      if (binding && !reachableBindings.has(binding)) return false;
    }
    current = current.parentPath;
  }
  return true;
}

function bindingForFunction(path) {
  if (path.node.id?.type === 'Identifier') return path.scope.getBinding(path.node.id.name);
  if (path.parentPath?.isVariableDeclarator() && path.parentPath.node.id.type === 'Identifier') {
    return path.parentPath.scope.getBinding(path.parentPath.node.id.name);
  }
  return null;
}

function resolveStyleObject(expressionPath, dynamicBindings) {
  if (!expressionPath.isIdentifier()) return [];
  const binding = expressionPath.scope.getBinding(expressionPath.node.name);
  if (!binding?.path.isVariableDeclarator()) return [];
  const initPath = binding.path.get('init');
  if (!initPath.isObjectExpression()) return [];
  const output = [];
  for (const propertyPath of initPath.get('properties')) {
    if (!propertyPath.isObjectProperty()) continue;
    const valuePath = propertyPath.get('value');
    if (!pathIsFrameDependent(valuePath, dynamicBindings)) continue;
    const property = objectPropertyName(propertyPath.node.key);
    output.push({ property, descriptors: styleDescriptors(property, valuePath.node) });
  }
  return output;
}

function classifyEffectBackend(setupPath, ast) {
  const text = generate(setupPath.node, { compact: true, comments: false }).code;
  if (/getContext\s*\(\s*['"]2d['"]|\bctx\.|clearRect\s*\(|fillRect\s*\(|drawImage\s*\(|canvasRef/i.test(text)) {
    return 'canvas';
  }
  if (/\.current\.(?:rotation|position|scale|material|intensity|uniforms)|meshRef|groupRef|materialRef|lightRef/i.test(text)) {
    return 'three';
  }
  let hasCanvas = false;
  let hasThree = false;
  traverse(ast, {
    JSXElement(path) {
      const tag = jsxName(path.node.openingElement.name);
      if (tag === 'canvas') hasCanvas = true;
      if (THREE_ROOT_TAGS.has(tag) || THREE_HINTS.has(tag)) hasThree = true;
    },
  });
  if (hasCanvas && /canvas|getContext|draw/i.test(text)) return 'canvas';
  if (hasThree && /rotation|position|scale|material|light|uniform/i.test(text)) return 'three';
  return 'dom';
}

function markInstrumented(sinks, indexes) {
  for (const index of indexes) sinks[index].instrumented = true;
}

function wrapTargetExpression(path, target, sinks) {
  const original = path.node;
  const metadata = t.valueToNode({
    ...target.descriptors[0],
    origins: target.sinkIndexes.map((index) => sinks[index].origin),
    __cbaWrapper: target.method,
  });
  let replacement;
  if (target.method === 'spread') {
    replacement = t.callExpression(runtimeMember('spread'), [
      t.stringLiteral(target.descriptors[0].id),
      t.arrowFunctionExpression([], original),
      metadata,
    ]);
  } else if (target.method === 'object') {
    replacement = t.callExpression(runtimeMember('object'), [
      t.arrayExpression(target.descriptors.map((descriptor) => t.valueToNode(descriptor))),
      t.arrowFunctionExpression([], original),
      metadata,
    ]);
  } else if (target.descriptors.length === 1) {
    replacement = t.callExpression(runtimeMember('value'), [
      t.stringLiteral(target.descriptors[0].id),
      t.arrowFunctionExpression([], original),
      metadata,
    ]);
  } else {
    replacement = t.callExpression(runtimeMember('values'), [
      t.arrayExpression(target.descriptors.map((descriptor) => t.valueToNode(descriptor))),
      t.arrowFunctionExpression([], original),
      metadata,
    ]);
  }
  path.replaceWith(replacement);
  markInstrumented(sinks, target.sinkIndexes);
}

function findFrameDependentBindings(ast) {
  const bindings = [];
  traverse(ast, {
    Program(path) {
      collectScopeBindings(path, bindings);
    },
    Function(path) {
      collectScopeBindings(path, bindings);
    },
    BlockStatement(path) {
      collectScopeBindings(path, bindings);
    },
  });
  const unique = [...new Set(bindings)];
  const dynamic = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const binding of unique) {
      if (dynamic.has(binding)) continue;
      const definitionPaths = bindingDefinitionPaths(binding);
      if (definitionPaths.some((path) => subtreeDependsOnFrame(path, dynamic))) {
        dynamic.add(binding);
        changed = true;
      }
    }
  }
  return dynamic;
}

function collectScopeBindings(path, output) {
  for (const binding of Object.values(path.scope.bindings)) output.push(binding);
}

function bindingDefinitionPaths(binding) {
  const paths = [];
  if (binding.path.isVariableDeclarator()) {
    const init = binding.path.get('init');
    if (init?.node) paths.push(init);
  } else if (binding.path.isFunctionDeclaration() || binding.path.isFunctionExpression()) {
    paths.push(binding.path);
  }
  for (const violation of binding.constantViolations) {
    paths.push(violation);
    let parent = violation.parentPath;
    while (parent && !parent.isFunction()) {
      if (
        parent.isIfStatement()
        || parent.isConditionalExpression()
        || parent.isLoop()
        || parent.isSwitchCase()
      ) paths.push(parent);
      parent = parent.parentPath;
    }
  }
  return paths;
}

function subtreeDependsOnFrame(rootPath, dynamicBindings) {
  let dependent = false;
  rootPath.traverse({
    CallExpression(path) {
      if (calleeName(path.node.callee) === 'useCurrentFrame') {
        dependent = true;
        path.stop();
      }
    },
    ReferencedIdentifier(path) {
      if (dynamicBindings.has(path.scope.getBinding(path.node.name))) {
        dependent = true;
        path.stop();
      }
    },
  });
  if (rootPath.isCallExpression() && calleeName(rootPath.node.callee) === 'useCurrentFrame') {
    dependent = true;
  }
  if (rootPath.isReferencedIdentifier() && dynamicBindings.has(rootPath.scope.getBinding(rootPath.node.name))) {
    dependent = true;
  }
  return dependent;
}

function pathIsFrameDependent(path, dynamicBindings) {
  return subtreeDependsOnFrame(path, dynamicBindings);
}

function wrapExpression(path, descriptors) {
  const original = path.node;
  const read = t.arrowFunctionExpression([], original);
  const descriptorNode = t.valueToNode({
    ...descriptors[0],
    __cbaWrapper: descriptors.length > 1 ? 'values' : 'value',
  });
  const replacement = descriptors.length === 1
    ? t.callExpression(runtimeMember('value'), [
      t.stringLiteral(descriptors[0].id), read, descriptorNode,
    ])
    : t.callExpression(runtimeMember('values'), [
      t.arrayExpression(descriptors.map((descriptor) => t.valueToNode(descriptor))),
      read,
      descriptorNode,
    ]);
  path.replaceWith(replacement);
  path.skip();
}

function wrapSpread(path, id, descriptor) {
  const original = path.node;
  path.replaceWith(t.callExpression(runtimeMember('spread'), [
    t.stringLiteral(id),
    t.arrowFunctionExpression([], original),
    t.valueToNode({ ...descriptor, __cbaWrapper: 'spread' }),
  ]));
  path.skip();
}

function restoreInstrumentation(ast) {
  traverse(ast, {
    CallExpression: {
      exit(path) {
        const method = runtimeMethod(path.node.callee);
        if (method === 'value') {
          path.replaceWith(arrowBody(path.node.arguments[1]));
        } else if (method === 'values') {
          path.replaceWith(arrowBody(path.node.arguments[1]));
        } else if (method === 'spread' || method === 'object') {
          path.replaceWith(arrowBody(path.node.arguments[1]));
        } else if (method === 'effect') {
          path.replaceWith(t.callExpression(
            path.node.arguments[1],
            path.node.arguments[2].elements,
          ));
        } else if (method === 'element') {
          path.replaceWith(t.callExpression(
            path.node.arguments[1],
            path.node.arguments[2].elements,
          ));
        } else if (method === 'repeat' || method === 'switch') {
          path.replaceWith(arrowBody(path.node.arguments[1]));
        }
      },
    },
  });
  return ast;
}

function normalizeLoweredAst(ast) {
  traverse(ast, {
    CallExpression: {
      exit(path) {
        const method = runtimeMethod(path.node.callee);
        if (method === 'template') {
          path.node.callee = runtimeMember('unitRaw');
          path.node.arguments = path.node.arguments.slice(1);
        } else if (method === 'value' || method === 'values' || method === 'spread' || method === 'object') {
          path.replaceWith(arrowBody(path.node.arguments[1]));
        } else if (method === 'effect') {
          path.replaceWith(t.callExpression(
            path.node.arguments[1],
            path.node.arguments[2].elements,
          ));
        } else if (method === 'element') {
          path.replaceWith(t.callExpression(
            path.node.arguments[1],
            path.node.arguments[2].elements,
          ));
        } else if (method === 'repeat' || method === 'switch') {
          path.replaceWith(arrowBody(path.node.arguments[1]));
        }
      },
    },
  });
  return ast;
}

function lowerJsx(ast, pragma) {
  return transformFromAstSync(ast, undefined, {
    ast: true,
    code: false,
    cloneInputAst: true,
    configFile: false,
    babelrc: false,
    comments: false,
    plugins: [[jsxPlugin, {
      runtime: 'classic',
      pragma,
      pragmaFrag: `${RUNTIME}.fragment`,
      throwIfNamespace: false,
      useBuiltIns: true,
    }]],
  });
}

function injectTemplateIds(ast, templatesByStart) {
  let count = 0;
  traverse(ast, {
    CallExpression(path) {
      if (runtimeMethod(path.node.callee) !== 'template') return;
      const id = templatesByStart.get(path.node.start);
      if (!id) return;
      path.node.arguments.unshift(t.stringLiteral(id));
      count += 1;
    },
  });
  return count;
}

function renameComposition(ast) {
  traverse(ast, {
    Program(path) {
      if (!path.scope.hasBinding('GeneratedComposition')) {
        throw new Error('GeneratedComposition binding was not found');
      }
      path.scope.rename('GeneratedComposition', 'createCompositionUnitTree');
      path.stop();
    },
  });
}

function describeUnit(path, tag) {
  const backend = nearestBackend(path, tag);
  const intrinsic = /^[a-z]/.test(tag);
  const componentKind = intrinsic
    ? 'intrinsic'
    : path.scope.getBinding(tag.split('.')[0]) ? 'local' : 'external';
  return {
    backend,
    componentKind,
    factoryId: unitFactoryId(tag, backend, componentKind),
  };
}

function unitFactoryId(tag, backend, componentKind) {
  if (tag === 'AbsoluteFill') return 'unit.remotion.layer';
  if (TIMELINE_TAGS.has(tag)) return 'unit.remotion.timeline-slot';
  if (IMAGE_TAGS.has(tag)) return 'unit.media.image';
  if (VIDEO_TAGS.has(tag)) return 'unit.media.video';
  if (AUDIO_TAGS.has(tag)) return 'unit.media.audio';
  if (backend === 'svg') return tag === 'svg' ? 'unit.svg.root' : 'unit.svg.element';
  if (backend === 'canvas') return 'unit.canvas.surface';
  if (backend === 'three') return THREE_ROOT_TAGS.has(tag) ? 'unit.three.scene' : 'unit.three.element';
  if (componentKind === 'local') return 'unit.react.local-component';
  if (componentKind === 'external') return 'unit.react.external-component';
  if (TEXT_TAGS.has(tag)) return 'unit.dom.text';
  return 'unit.dom.element';
}

function nearestBackend(path, ownTag = null) {
  if (ownTag === 'svg' || SVG_TAGS.has(ownTag) && ownTag !== 'text') return 'svg';
  if (ownTag === 'canvas') return 'canvas';
  if (THREE_ROOT_TAGS.has(ownTag) || THREE_HINTS.has(ownTag)) return 'three';
  let current = path;
  let first = true;
  while (current) {
    if (current.isJSXElement?.()) {
      const tag = first && ownTag
        ? ownTag
        : jsxName(current.node.openingElement.name);
      if (tag === 'svg' || SVG_TAGS.has(tag) && tag !== 'text') return 'svg';
      if (tag === 'canvas') return 'canvas';
      if (THREE_ROOT_TAGS.has(tag) || THREE_HINTS.has(tag)) return 'three';
      first = false;
    }
    current = current.parentPath;
  }
  return 'dom';
}

function styleDescriptors(property, expression) {
  if (property === 'opacity') return [{ id: 'behaviour.css.opacity', channel: 'opacity' }];
  if (property !== 'transform') {
    return [{ id: 'behaviour.css.property', channel: 'property', property }];
  }
  const operations = transformOperations(expression);
  return operations.map(({ channel, operationIndex }) => ({
    id: `behaviour.transform.${channel}`,
    channel,
    property: 'transform',
    metadata: { operationIndex },
  }));
}

function transformOperations(expression) {
  const text = generate(expression, { compact: true, comments: false }).code.toLowerCase();
  const operations = [];
  const counts = new Map();
  const pattern = /\b(scale(?:3d|x|y|z)?|translate(?:3d|x|y|z)?|rotate(?:3d|x|y|z)?)\s*\(/gi;
  for (const match of text.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const channel = name.startsWith('scale')
      ? 'scale'
      : name.startsWith('translate') ? 'translate' : 'rotate';
    const operationIndex = counts.get(channel) ?? 0;
    counts.set(channel, operationIndex + 1);
    operations.push({ channel, operationIndex });
  }
  return operations.length > 0 ? operations : [{ channel: 'transform', operationIndex: 0 }];
}

function attributeDescriptors(name, backend, expression) {
  if (name === 'style') return styleDescriptors('style', expression);
  if (backend === 'svg') return [{ id: 'behaviour.svg.attribute', channel: 'svg-attribute', property: name }];
  if (backend === 'three') return [{ id: 'behaviour.three.property', channel: 'three-property', property: name }];
  if (backend === 'canvas') return [{ id: 'behaviour.canvas.property', channel: 'attribute', property: name }];
  return [{ id: 'behaviour.dom.attribute', channel: 'attribute', property: name }];
}

function makeSink(node, behaviourIds, descriptor, instrumented) {
  return {
    start: node?.start ?? null,
    behaviourIds,
    channel: descriptor.channel,
    property: descriptor.property ?? null,
    backend: descriptor.backend ?? null,
    instrumented,
  };
}

function publicInventory(inventory) {
  return {
    units: inventory.units.map(({ factoryId, backend, componentKind }) => ({
      factoryId, backend, componentKind,
    })),
    behaviourSinks: inventory.behaviourSinks.map(({ behaviourIds, channel, property, backend }) => ({
      behaviourIds, channel, property, backend,
    })),
    controls: inventory.controls,
  };
}

function exactAstHash(node) {
  return sha256(JSON.stringify(stripAstMetadata(node)));
}

function stripAstMetadata(value) {
  if (Array.isArray(value)) return value.map(stripAstMetadata);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if ([
      'start', 'end', 'loc', 'extra', 'comments', 'leadingComments',
      'innerComments', 'trailingComments', 'tokens', 'errors',
    ].includes(key)) continue;
    output[key] = stripAstMetadata(nested);
  }
  return output;
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function runtimeMember(property) {
  return t.memberExpression(t.identifier(RUNTIME), t.identifier(property));
}

function runtimeMethod(callee) {
  return callee?.type === 'MemberExpression'
    && !callee.computed
    && callee.object?.type === 'Identifier'
    && callee.object.name === RUNTIME
    && callee.property?.type === 'Identifier'
    ? callee.property.name
    : null;
}

function arrowBody(node) {
  if (!node || node.type !== 'ArrowFunctionExpression' || node.body.type === 'BlockStatement') {
    throw new Error('Invalid reversible CBA wrapper');
  }
  return node.body;
}

function isUseEffectCall(callee) {
  const name = calleeName(callee);
  return name === 'useEffect' || name === 'React.useEffect';
}

function isReactCreateElementCall(callee) {
  const name = calleeName(callee);
  return name === 'React.createElement' || name === 'createElement';
}

function createElementTag(node) {
  if (node?.type === 'StringLiteral') return node.value;
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression') return calleeName(node);
  return 'DynamicComponent';
}

function calleeName(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    return `${calleeName(node.object)}.${calleeName(node.property)}`;
  }
  return '';
}

function jsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${jsxName(node.object)}.${jsxName(node.property)}`;
  if (node.type === 'JSXNamespacedName') return `${jsxName(node.namespace)}:${jsxName(node.name)}`;
  return '';
}

function objectPropertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'StringLiteral' || node?.type === 'NumericLiteral') return String(node.value);
  return 'computed';
}
