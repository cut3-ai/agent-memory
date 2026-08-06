import traverseModule from '@babel/traverse';

import { canonicalAstHash, calleeName, jsxName, mediaKind, normalizeExactSource, numericDirection, parseComposition, propertyName, walkAst } from '../shared/normalize.js';
import { increment, sha256, sortedEntries, uniqueSorted } from '../../src/lib.js';

const traverse = traverseModule.default;

const STYLE_PROPERTIES = new Set([
  'opacity',
  'transform',
  'filter',
  'background',
  'backgroundColor',
  'backgroundImage',
  'mixBlendMode',
  'clipPath',
  'maskImage',
  'WebkitMaskImage',
  'textShadow',
  'boxShadow',
  'WebkitTextStroke',
  'fontSize',
  'fontFamily',
  'objectFit',
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'width',
  'height',
  'zIndex',
  'perspective',
  'transformStyle',
  'overflow',
]);

const URL_PATTERN = /https?:\/\/[^\s'"`)<>]+/gi;

export function extractObservation({ workspace, workspaceIndex, track, trackIndex }) {
  const rawSource = String(track.source ?? '');
  const sourceHash = sha256(normalizeExactSource(rawSource));
  const observationId = sha256(
    `${workspaceIndex}:${trackIndex}:${track.id ?? ''}:${sourceHash}`,
  );

  let extracted;
  try {
    const parsed = parseComposition(rawSource);
    extracted = extractAstFeatures(parsed.ast, parsed.stripped, rawSource);
  } catch (error) {
    extracted = invalidFeatures(rawSource, error);
  }

  return {
    schemaVersion: 1,
    observationId,
    sourceHash,
    workspace: {
      index: workspaceIndex,
      width: Number(workspace.width ?? 0),
      height: Number(workspace.height ?? 0),
      fps: Number(workspace.fps ?? 0),
      length: Number(workspace.length ?? 0),
    },
    track: {
      index: trackIndex,
      id: String(track.id ?? `track-${trackIndex}`),
      start: Number(track.start ?? 0),
      length: Number(track.length ?? 0),
      zIndex: Number.isFinite(track.zIndex) ? track.zIndex : null,
      hasCover: typeof track.meta?.cover === 'string' && track.meta.cover.length > 0,
      comment: typeof track.meta?.comment === 'string' ? track.meta.comment : null,
    },
    private: {
      prompt: typeof track.meta?.prompt === 'string' ? track.meta.prompt : '',
      source: rawSource,
      cover: typeof track.meta?.cover === 'string' ? track.meta.cover : null,
    },
    code: extracted,
    signals: [],
    feedback: { state: 'unknown' },
    state: 'observed',
    trusted: false,
    evidenceStatus: 'observed',
  };
}

function extractAstFeatures(ast, strippedSource, rawSource) {
  const nodeTypes = new Map();
  const calls = new Map();
  const jsxTags = new Map();
  const styleProperties = new Map();
  const operators = new Map();
  const globalIdentifiers = new Map();
  const literalClasses = new Map();
  const motionPrimitives = new Map();
  const helpers = [];
  let generatedCompositionFound = false;

  for (const statement of ast.program.body) {
    const helper = extractTopLevelHelper(statement);
    if (!helper) continue;
    if (helper.name === 'GeneratedComposition') {
      generatedCompositionFound = true;
    } else {
      helpers.push(helper);
    }
  }

  walkAst(ast, (node, parent, key) => {
    increment(nodeTypes, node.type);

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const name = calleeName(node.callee);
      if (name) increment(calls, name);
      if (name === 'interpolate') {
        const outputValues = numericArrayValues(node.arguments?.[2]);
        const shape = outputValues ? numericDirection(outputValues) : 'dynamic';
        const arity = outputValues?.length ?? 'dynamic';
        increment(motionPrimitives, `interpolate:${shape}:${arity}`);
      }
      if (name === 'spring') increment(motionPrimitives, 'spring');
      if (name === 'Math.sin' || name === 'Math.cos') increment(motionPrimitives, 'oscillation');
    }
    if (node.type === 'NewExpression') {
      const name = calleeName(node.callee);
      if (name) increment(calls, `new:${name}`);
    }
    if (node.type === 'JSXOpeningElement') {
      const name = jsxName(node.name);
      if (name) increment(jsxTags, name);
    }
    if (node.type === 'ObjectProperty' || node.type === 'ObjectMethod') {
      const name = propertyName(node.key);
      if (name && STYLE_PROPERTIES.has(name)) increment(styleProperties, name);
    }
    if (
      node.type === 'BinaryExpression'
      || node.type === 'LogicalExpression'
      || node.type === 'UnaryExpression'
      || node.type === 'UpdateExpression'
    ) {
      increment(operators, node.operator);
    }
    if (node.type === 'Identifier' && isReferenceIdentifier(node, parent, key)) {
      if (isRuntimeGlobal(node.name)) increment(globalIdentifiers, node.name);
    }
    if (node.type === 'StringLiteral') {
      increment(literalClasses, classifyLiteral(node.value));
    }
  });

  const dependencies = extractDependencies(rawSource);
  const families = inferFamilies({ calls, jsxTags, styleProperties, rawSource });
  const reachableFunctions = findReachableFunctions(ast);
  const visualAtoms = extractVisualAtoms(ast, strippedSource, reachableFunctions);
  const visualFragments = extractVisualFragments(ast, strippedSource, reachableFunctions);
  const fingerprintTokens = buildFingerprintTokens({
    nodeTypes,
    calls,
    jsxTags,
    styleProperties,
    operators,
    globalIdentifiers,
    literalClasses,
    motionPrimitives,
    helpers,
  });

  return {
    parseStatus: 'valid',
    parseError: null,
    sourceChars: rawSource.length,
    strippedChars: strippedSource.length,
    spanSource: 'normalized-composition',
    generatedCompositionFound,
    structuralHash: canonicalAstHash(ast.program),
    features: {
      nodeTypes: Object.fromEntries(sortedEntries(nodeTypes)),
      calls: Object.fromEntries(sortedEntries(calls)),
      jsxTags: Object.fromEntries(sortedEntries(jsxTags)),
      styleProperties: Object.fromEntries(sortedEntries(styleProperties)),
      operators: Object.fromEntries(sortedEntries(operators)),
      globalIdentifiers: Object.fromEntries(sortedEntries(globalIdentifiers)),
      literalClasses: Object.fromEntries(sortedEntries(literalClasses)),
      motionPrimitives: Object.fromEntries(sortedEntries(motionPrimitives)),
      families,
      renderMode: inferRenderMode(families, jsxTags),
      hasCodeFence: /```/.test(rawSource),
      hasMathRandom: /\bMath\.random\s*\(/.test(rawSource),
      hasNondeterministicClock: /\b(?:Date\.(?:now)|performance\.now)\s*\(/.test(rawSource),
      hasDeterministicFrame: /\buseCurrentFrame\s*\(/.test(rawSource),
    },
    helpers: helpers.sort((left, right) => left.name.localeCompare(right.name)),
    visualAtoms,
    visualFragments,
    dependencies,
    fingerprintTokens,
  };
}

function invalidFeatures(rawSource, error) {
  return {
    parseStatus: 'invalid',
    parseError: String(error?.message ?? error).split('\n')[0],
    sourceChars: rawSource.length,
    strippedChars: null,
    spanSource: 'normalized-composition',
    generatedCompositionFound: /\bGeneratedComposition\b/.test(rawSource),
    structuralHash: sha256(`invalid:${rawSource}`),
    features: {
      nodeTypes: {},
      calls: {},
      jsxTags: {},
      styleProperties: {},
      operators: {},
      globalIdentifiers: {},
      literalClasses: {},
      motionPrimitives: {},
      families: [],
      renderMode: 'unknown',
      hasCodeFence: /```/.test(rawSource),
      hasMathRandom: /\bMath\.random\s*\(/.test(rawSource),
      hasNondeterministicClock: /\b(?:Date\.(?:now)|performance\.now)\s*\(/.test(rawSource),
      hasDeterministicFrame: /\buseCurrentFrame\s*\(/.test(rawSource),
    },
    helpers: [],
    visualAtoms: [],
    visualFragments: [],
    dependencies: extractDependencies(rawSource),
    fingerprintTokens: [],
  };
}

/**
 * Locate frame-driven writes at their actual JSX style sink. This is
 * deliberately narrower than the composition-wide feature summary above:
 * opacity on one node and scale on another become two independent atoms.
 */
function extractVisualAtoms(ast, source, reachableFunctions) {
  const atoms = [];
  let jsxNodeIndex = 0;

  traverse(ast, {
    JSXOpeningElement(openingPath) {
    if (!isInsideReachableFunction(openingPath, reachableFunctions)) return;
    const node = openingPath.node;
    const nodeIndex = jsxNodeIndex;
    jsxNodeIndex += 1;
    const styleObjectPath = findStyleObjectPath(openingPath);
    if (!styleObjectPath) return;

    for (const propertyPath of styleObjectPropertyPaths(styleObjectPath)) {
      const property = propertyPath.node;
      const styleName = propertyName(property.key);
      if (!styleName || !property.value) continue;
      const valuePath = propertyPath.get('value');
      const targets = styleName === 'transform'
        ? transformChannelTargets(valuePath, source)
        : styleNameToChannels(styleName).map((channel) => ({ channel, expressionPaths: [valuePath] }));

      for (const target of targets) {
        const closure = expressionClosurePaths(target.expressionPaths);
        if (!closure.frameDriven) continue;
        const drivers = inferDrivers(closure.nodes, closure.frameDriven);
        const shapes = inferMotionShapes(closure.nodes);
        const span = coveringSpan(target.expressionPaths.map((entry) => entry.node));
        if (!span) continue;
        const expressionHash = sha256(target.expressionPaths
          .map((entry) => canonicalAstHash(entry.node))
          .sort()
          .join(':'));
        const dependencyHash = sha256(closure.nodes
          .map((entry) => canonicalAstHash(entry))
          .sort()
          .join(':'));
        const variantHash = sha256(JSON.stringify({
          channel: target.channel,
          drivers,
          shapes,
          expressionHash,
          dependencyHash,
        }));
        atoms.push({
          atomId: sha256(`${nodeIndex}:${target.channel}:${span.start}:${span.end}:${expressionHash}`),
          nodeIndex,
          rootKind: safeRootKind(jsxName(node.name)),
          channel: target.channel,
          frameDriven: true,
          drivers,
          shapes,
          expressionHash,
          dependencyHash,
          variantHash,
          span,
          dependencySpans: closure.dependencies
            .map(nodeSpan)
            .filter(Boolean)
            .sort(compareSpans),
        });
      }
    }
    },
  });

  return uniqueAtoms(atoms).sort((left, right) => (
    left.span.start - right.span.start
    || left.channel.localeCompare(right.channel)
    || left.atomId.localeCompare(right.atomId)
  ));
}

/**
 * Keep sanitized, local JSX subtree descriptors for unit discovery. No source
 * text, identifiers, literals or URLs leave the private observation.
 */
function extractVisualFragments(ast, source, reachableFunctions) {
  const fragments = [];
  let fragmentIndex = 0;

  traverse(ast, {
    JSXElement(elementPath) {
    if (!isInsideReachableFunction(elementPath, reachableFunctions)) return;
    const node = elementPath.node;
    const span = nodeSpan(node);
    if (!span) return;
    const opening = node.openingElement;
    const localSource = sourceSlice(source, node);
    const styleObjectPath = findStyleObjectPath(elementPath.get('openingElement'));
    const directStylePropertyPaths = styleObjectPropertyPaths(styleObjectPath);
    const directStyleProperties = directStylePropertyPaths
      .map((propertyPath) => propertyName(propertyPath.node.key))
      .filter((name) => STYLE_PROPERTIES.has(name));
    const directStyleSource = directStylePropertyPaths
      .map((propertyPath) => sourceSlice(source, propertyPath.node))
      .join('\n');
    const subtreeStyleProperties = new Set();
    const subtreeTags = new Set();
    const calls = new Set();

    walkAst(node, (nested) => {
      if (nested.type === 'ObjectProperty' || nested.type === 'ObjectMethod') {
        const name = propertyName(nested.key);
        if (name && STYLE_PROPERTIES.has(name)) subtreeStyleProperties.add(name);
      }
      if (nested.type === 'JSXOpeningElement') {
        subtreeTags.add(safeRootKind(jsxName(nested.name)));
      }
      if (nested.type === 'CallExpression' || nested.type === 'OptionalCallExpression') {
        const name = calleeName(nested.callee);
        if (name) calls.add(name);
      }
    });

    const rootKind = safeRootKind(jsxName(opening.name));
    const families = fragmentFamilies({ rootKind, subtreeTags, localSource, subtreeStyleProperties });
    const hasText = families.includes('text');
    const containsMedia = families.includes('image') || families.includes('video');
    const hasFourZeroEdges = ['top', 'right', 'bottom', 'left'].every((edge) => (
      new RegExp(`\\b${edge}\\s*:\\s*0(?:\\b|\\s*[,}])`, 'i').test(directStyleSource)
    ));
    const fullFrame = rootKind === 'absolute-fill'
      || (/\bposition\s*:\s*['"]absolute['"]/i.test(directStyleSource)
        && (/\binset\s*:\s*0\b/i.test(directStyleSource)
          || hasFourZeroEdges
          || (/\bwidth\s*:\s*['"]100%['"]/i.test(directStyleSource)
            && /\bheight\s*:\s*['"]100%['"]/i.test(directStyleSource))));
    const hasColorBackground = /\b(?:background|backgroundColor)\s*:\s*(?:['"](?:#[a-f0-9]{3,8}|white|black|red|blue|green|yellow|gray|grey|rgba?\(|hsla?\()|`(?:#[a-f0-9]{3,8}|rgba?\(|hsla?\())/i.test(localSource);
    const hasDirectColorBackground = /\b(?:background|backgroundColor)\s*:\s*(?:['"](?:#[a-f0-9]{3,8}|white|black|red|blue|green|yellow|gray|grey|rgba?\(|hsla?\()|`(?:#[a-f0-9]{3,8}|rgba?\(|hsla?\())/i.test(directStyleSource);
    const hasStyledContainer = ['background', 'backgroundColor', 'boxShadow', 'borderRadius']
      .some((name) => subtreeStyleProperties.has(name) || new RegExp(`\\b${name}\\b`).test(localSource));

    fragments.push({
      fragmentId: sha256(`${fragmentIndex}:${span.start}:${span.end}:${canonicalAstHash(node)}`),
      fragmentIndex,
      rootKind,
      span,
      structuralHash: canonicalAstHash(node),
      directStyleProperties: uniqueSorted(directStyleProperties),
      subtreeStyleProperties: uniqueSorted([...subtreeStyleProperties]),
      families,
      fullFrame,
      containsMedia,
      hasText,
      hasMapShape: calls.has('map') || /\.map\s*\(/.test(localSource),
      hasColorBackground,
      hasDirectColorBackground,
      childElementCount: (node.children ?? []).filter((child) => child.type === 'JSXElement').length,
      hasCustomDescendant: subtreeTags.has('custom'),
      hasStyledContainer,
      hasVignetteGradient: /radial-gradient[\s\S]{0,300}(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0)[\s\S]{0,300}(?:black|rgba?\(\s*0\s*,\s*0\s*,\s*0)/i.test(localSource),
      hasDirectVignetteGradient: /\b(?:background|backgroundImage)\s*:[\s\S]{0,100}radial-gradient[\s\S]{0,300}(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0)[\s\S]{0,300}(?:black|rgba?\(\s*0\s*,\s*0\s*,\s*0)/i.test(directStyleSource),
      hasNoiseSemantics: /\b(?:film\s*)?(?:grain|noise)\b/i.test(localSource),
      hasRankingSemantics: /\b(?:rank(?:ing)?|rankNumber|rankLabel|countdown|top\s*\d+)\b/i.test(localSource),
      hasDialogueSemantics: /\b(?:dialogue|subtitle|caption|speech|speaker)\b/i.test(localSource),
      hasTimedScatterSemantics: /\b(?:chunks?|words?|tokens?)\b/i.test(localSource)
        && /\b(?:start|end|delay|offset|timing)(?:Ms|Frame|Time)?\b/i.test(localSource),
    });
    fragmentIndex += 1;
    },
  });

  return fragments.sort((left, right) => (
    left.span.start - right.span.start
    || left.span.end - right.span.end
    || left.fragmentId.localeCompare(right.fragmentId)
  ));
}

function findReachableFunctions(ast) {
  const reachable = new Set();
  const queue = [];

  traverse(ast, {
    Program(programPath) {
      const generatedBinding = programPath.scope.getBinding('GeneratedComposition');
      const generatedPath = bindingFunctionPath(generatedBinding);
      if (generatedPath) queue.push(generatedPath);
      programPath.stop();
    },
  });

  while (queue.length > 0) {
    const functionPath = queue.shift();
    if (!functionPath?.node || reachable.has(functionPath.node)) continue;
    reachable.add(functionPath.node);
    functionPath.traverse({
      Function(nestedPath) {
        if (isImmediatelyInvokedFunction(nestedPath) && !reachable.has(nestedPath.node)) {
          queue.push(nestedPath);
        }
        nestedPath.skip();
      },
      JSXOpeningElement(openingPath) {
        const name = jsxName(openingPath.node.name);
        if (!name || !/^[A-Z]/.test(name)) return;
        const nestedPath = bindingFunctionPath(openingPath.scope.getBinding(name));
        if (nestedPath && !reachable.has(nestedPath.node)) queue.push(nestedPath);
      },
      CallExpression(callPath) {
        if (callPath.node.callee?.type !== 'Identifier') return;
        const nestedPath = bindingFunctionPath(callPath.scope.getBinding(callPath.node.callee.name));
        if (nestedPath && !reachable.has(nestedPath.node)) queue.push(nestedPath);
      },
    });
  }

  return reachable;
}

function bindingFunctionPath(binding) {
  if (!binding?.path) return null;
  if (binding.path.isFunctionDeclaration()) return binding.path;
  if (!binding.path.isVariableDeclarator()) return null;
  const initPath = binding.path.get('init');
  if (initPath?.isFunction()) return initPath;
  if (!initPath?.isCallExpression()) return null;
  const wrapperName = calleeName(initPath.node.callee);
  if (!['memo', 'React.memo', 'forwardRef', 'React.forwardRef'].includes(wrapperName)) return null;
  const implementationPath = initPath.get('arguments')[0];
  return implementationPath?.isFunction() ? implementationPath : null;
}

function isInsideReachableFunction(path, reachableFunctions) {
  const functionPath = path.getFunctionParent();
  return Boolean(functionPath && reachableFunctions.has(functionPath.node));
}

function isImmediatelyInvokedFunction(functionPath) {
  const parentPath = functionPath.parentPath;
  if (!parentPath?.isCallExpression()) return false;
  if (parentPath.get('callee').node === functionPath.node) return true;
  const callbackIsArgument = parentPath.get('arguments')
    .some((argumentPath) => argumentPath.node === functionPath.node);
  if (!callbackIsArgument) return false;
  return ['map', 'flatMap', 'Array.from'].includes(calleeName(parentPath.node.callee));
}

function findStyleObjectPath(openingPath) {
  const styleAttributePath = openingPath.get('attributes').find((attributePath) => (
    attributePath.isJSXAttribute()
    && attributePath.get('name').isJSXIdentifier({ name: 'style' })
  ));
  if (!styleAttributePath) return null;
  const valuePath = styleAttributePath.get('value');
  if (!valuePath.isJSXExpressionContainer()) return null;
  return resolveObjectExpressionPath(valuePath.get('expression'));
}

function resolveObjectExpressionPath(expressionPath, seenBindings = new Set()) {
  if (!expressionPath?.node) return null;
  if (expressionPath.isObjectExpression()) return expressionPath;
  if (!expressionPath.isIdentifier()) return null;
  const binding = expressionPath.scope.getBinding(expressionPath.node.name);
  if (!binding || seenBindings.has(binding)) return null;
  seenBindings.add(binding);
  if (!binding.path.isVariableDeclarator()) return null;
  return resolveObjectExpressionPath(binding.path.get('init'), seenBindings);
}

function styleObjectPropertyPaths(objectPath, seenObjects = new Set()) {
  if (!objectPath?.node || seenObjects.has(objectPath.node)) return [];
  seenObjects.add(objectPath.node);
  const result = [];
  for (const propertyPath of objectPath.get('properties')) {
    if (propertyPath.isObjectProperty()) result.push(propertyPath);
    if (propertyPath.isSpreadElement()) {
      const spreadPath = resolveObjectExpressionPath(propertyPath.get('argument'));
      result.push(...styleObjectPropertyPaths(spreadPath, seenObjects));
    }
  }
  return result;
}

function expressionClosurePaths(expressionPaths) {
  const queue = [...expressionPaths];
  const seenNodes = new Set();
  const dependencies = [];
  const referencedBindings = new Set();
  let frameDriven = false;

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath?.node || seenNodes.has(currentPath.node)) continue;
    seenNodes.add(currentPath.node);

    const inspect = (nestedPath) => {
      if (nestedPath.isCallExpression() || nestedPath.isOptionalCallExpression()) {
        if (calleeName(nestedPath.node.callee) === 'useCurrentFrame') frameDriven = true;
      }
      if (!nestedPath.isReferencedIdentifier()) return;
      const binding = nestedPath.scope.getBinding(nestedPath.node.name);
      if (!binding || referencedBindings.has(binding) || !binding.path.isVariableDeclarator()) return;
      const dependencyPath = binding.path.get('init');
      if (!dependencyPath?.node) return;
      referencedBindings.add(binding);
      dependencies.push(dependencyPath.node);
      queue.push(dependencyPath);
    };

    inspect(currentPath);
    currentPath.traverse({ enter: inspect });
  }

  return {
    nodes: [...seenNodes],
    dependencies,
    frameDriven,
  };
}

function inferDrivers(nodes, frameDriven) {
  const drivers = new Set();
  for (const root of nodes) {
    walkAst(root, (node) => {
      if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return;
      const name = calleeName(node.callee);
      if (name === 'interpolate') drivers.add('keyframes');
      if (name === 'spring') drivers.add('spring');
      if (name === 'Math.sin' || name === 'Math.cos') drivers.add('oscillation');
    });
  }
  if (drivers.size === 0 && frameDriven) drivers.add('formula');
  return [...drivers].sort();
}

function inferMotionShapes(nodes) {
  const shapes = new Set();
  for (const root of nodes) {
    walkAst(root, (node) => {
      if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return;
      if (calleeName(node.callee) !== 'interpolate') return;
      const values = numericArrayValues(node.arguments?.[2]);
      if (values) shapes.add(`${numericDirection(values)}:${values.length}`);
    });
  }
  return [...shapes].sort();
}

function styleNameToChannels(styleName) {
  if (styleName === 'opacity') return ['opacity'];
  if (styleName === 'filter') return ['filter'];
  if (styleName === 'clipPath' || styleName === 'maskImage' || styleName === 'WebkitMaskImage') {
    return ['clip'];
  }
  return [];
}

function transformChannelTargets(valuePath, source) {
  const resolvedPaths = resolveValuePaths(valuePath);
  const targets = new Map();

  for (const resolvedPath of resolvedPaths) {
    collectTemplateTransformTargets(resolvedPath, targets);
  }

  if (targets.size === 0) {
    for (const resolvedPath of resolvedPaths) {
      const localSource = sourceSlice(source, resolvedPath.node);
      const channels = transformChannelsInText(localSource);
      if (channels.length === 1) addTransformTarget(targets, channels[0], resolvedPath);
    }
  }

  return [...targets.entries()]
    .map(([channel, expressionPaths]) => ({ channel, expressionPaths }))
    .sort((left, right) => left.channel.localeCompare(right.channel));
}

function resolveValuePaths(valuePath, seenBindings = new Set()) {
  if (!valuePath?.node) return [];
  if (valuePath.isIdentifier()) {
    const binding = valuePath.scope.getBinding(valuePath.node.name);
    if (binding?.path.isVariableDeclarator() && !seenBindings.has(binding)) {
      seenBindings.add(binding);
      return resolveValuePaths(binding.path.get('init'), seenBindings);
    }
  }
  if (valuePath.isConditionalExpression()) {
    return [
      ...resolveValuePaths(valuePath.get('consequent'), new Set(seenBindings)),
      ...resolveValuePaths(valuePath.get('alternate'), new Set(seenBindings)),
    ];
  }
  if (valuePath.isLogicalExpression()) {
    return [
      ...resolveValuePaths(valuePath.get('left'), new Set(seenBindings)),
      ...resolveValuePaths(valuePath.get('right'), new Set(seenBindings)),
    ];
  }
  return [valuePath];
}

function collectTemplateTransformTargets(rootPath, targets) {
  const inspectTemplate = (templatePath) => {
    const expressionPaths = templatePath.get('expressions');
    const quasiPaths = templatePath.get('quasis');
    expressionPaths.forEach((expressionPath, index) => {
      const prefix = quasiPaths[index]?.node?.value?.raw ?? '';
      const channel = openTransformChannel(prefix);
      if (channel) addTransformTarget(targets, channel, expressionPath);
    });
  };

  if (rootPath.isTemplateLiteral()) inspectTemplate(rootPath);
  rootPath.traverse({ TemplateLiteral: inspectTemplate });
}

function openTransformChannel(prefix) {
  const match = prefix.match(/\b(scale(?:3d|X|Y)?|translate(?:3d|X|Y|Z)?|rotate(?:3d|X|Y|Z)?)\s*\([^)]*$/);
  return match ? transformFunctionChannel(match[1]) : null;
}

function transformChannelsInText(value) {
  const channels = new Set();
  for (const match of String(value).matchAll(/\b(scale(?:3d|X|Y)?|translate(?:3d|X|Y|Z)?|rotate(?:3d|X|Y|Z)?)\s*\(/g)) {
    channels.add(transformFunctionChannel(match[1]));
  }
  return [...channels].filter(Boolean).sort();
}

function transformFunctionChannel(name) {
  if (name.startsWith('scale')) return 'transform.scale';
  if (name.startsWith('translate')) return 'transform.translate';
  if (name.startsWith('rotate')) return 'transform.rotate';
  return null;
}

function addTransformTarget(targets, channel, expressionPath) {
  if (!channel || !expressionPath?.node) return;
  if (!targets.has(channel)) targets.set(channel, []);
  const entries = targets.get(channel);
  if (!entries.some((entry) => entry.node === expressionPath.node)) entries.push(expressionPath);
}

function fragmentFamilies({ rootKind, subtreeTags, localSource, subtreeStyleProperties }) {
  const families = new Set();
  if (subtreeTags.has('image')) families.add('image');
  if (subtreeTags.has('video')) families.add('video');
  if (subtreeTags.has('audio')) families.add('audio');
  if (subtreeTags.has('canvas')) families.add('canvas');
  if (subtreeTags.has('svg')) families.add('svg');
  if (subtreeTags.has('three') || /\bTHREE\.|<(?:mesh|group|points|lineSegments)\b/.test(localSource)) families.add('three');
  if (subtreeStyleProperties.has('fontSize') || /<(?:span|pre|text)\b/i.test(localSource)) families.add('text');
  if (rootKind === 'image') families.add('image');
  if (rootKind === 'video') families.add('video');
  if (rootKind === 'audio') families.add('audio');
  return [...families].sort();
}

function safeRootKind(name) {
  if (name === 'AbsoluteFill') return 'absolute-fill';
  if (name === 'Img' || name === 'AnimatedImage') return 'image';
  if (name === 'Video' || name === 'OffthreadVideo') return 'video';
  if (name === 'Audio') return 'audio';
  if (name === 'ThreeCanvas' || ['mesh', 'group', 'points', 'lineSegments'].includes(name)) return 'three';
  if (name === 'canvas') return 'canvas';
  if (name === 'svg') return 'svg';
  if (['div', 'span', 'pre', 'text'].includes(name)) return name;
  return 'custom';
}

function nodeSpan(node) {
  return Number.isInteger(node?.start) && Number.isInteger(node?.end)
    ? { start: node.start, end: node.end }
    : null;
}

function coveringSpan(nodes) {
  const spans = nodes.map(nodeSpan).filter(Boolean);
  if (spans.length === 0) return null;
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
  };
}

function sourceSlice(source, node) {
  const span = nodeSpan(node);
  return span ? source.slice(span.start, span.end) : '';
}

function compareSpans(left, right) {
  return left.start - right.start || left.end - right.end;
}

function uniqueAtoms(atoms) {
  const unique = new Map();
  for (const atom of atoms) {
    const key = `${atom.nodeIndex}:${atom.channel}:${atom.span.start}:${atom.span.end}`;
    unique.set(key, atom);
  }
  return [...unique.values()];
}

function numericArrayValues(node) {
  if (node?.type !== 'ArrayExpression' || node.elements.length === 0) return null;
  const values = node.elements.map((element) => (
    element?.type === 'NumericLiteral' ? element.value : null
  ));
  return values.every((value) => value !== null) ? values : null;
}

function inferRenderMode(families, jsxTags) {
  if (families.includes('three')) return 'three';
  if (families.includes('canvas')) return 'canvas2d';
  if (jsxTags.has('svg')) return 'svg';
  return 'dom';
}

function extractTopLevelHelper(statement) {
  if (statement.type === 'FunctionDeclaration' && statement.id) {
    return {
      name: statement.id.name,
      kind: 'function',
      parameters: statement.params.length,
      structuralHash: canonicalAstHash(statement),
    };
  }

  if (statement.type !== 'VariableDeclaration' || statement.declarations.length !== 1) {
    return null;
  }
  const declaration = statement.declarations[0];
  if (declaration.id?.type !== 'Identifier') return null;
  if (!['ArrowFunctionExpression', 'FunctionExpression'].includes(declaration.init?.type)) {
    return null;
  }

  return {
    name: declaration.id.name,
    kind: declaration.init.type === 'ArrowFunctionExpression' ? 'arrow' : 'function-expression',
    parameters: declaration.init.params.length,
    structuralHash: canonicalAstHash(declaration.init),
  };
}

function buildFingerprintTokens(parts) {
  const tokens = new Map();
  addTokens(tokens, 'node', parts.nodeTypes, 4);
  addTokens(tokens, 'call', parts.calls, 4);
  addTokens(tokens, 'jsx', parts.jsxTags, 4);
  addTokens(tokens, 'style', parts.styleProperties, 3);
  addTokens(tokens, 'operator', parts.operators, 3);
  addTokens(tokens, 'global', parts.globalIdentifiers, 3);
  addTokens(tokens, 'literal', parts.literalClasses, 3);
  addTokens(tokens, 'motion', parts.motionPrimitives, 4);

  increment(tokens, `shape:helper-count:${bucketCount(parts.helpers.length)}`);
  for (const helper of parts.helpers) {
    increment(tokens, `helper:${normalizeHelperName(helper.name)}`);
    increment(tokens, `helper-arity:${helper.parameters}`);
  }

  return sortedEntries(tokens);
}

function addTokens(target, prefix, source, cap) {
  for (const [name, count] of source) {
    target.set(`${prefix}:${name}`, Math.min(count, cap));
  }
}

function normalizeHelperName(name) {
  if (/^(?:ms2f|msToFrames)$/i.test(name)) return 'msToFrames';
  if (/^lerp$/i.test(name)) return 'lerp';
  if (/^clamp$/i.test(name)) return 'clamp';
  if (/^(?:jitter|wobble|boil)$/i.test(name)) return 'jitter-like';
  if (/^(?:pseudoRandom|mulberry32)$/i.test(name)) return 'deterministic-rng';
  return '_custom';
}

function bucketCount(count) {
  if (count === 0) return '0';
  if (count === 1) return '1';
  if (count <= 3) return '2-3';
  if (count <= 7) return '4-7';
  return '8+';
}

function classifyLiteral(value) {
  if (/^https?:\/\//i.test(value)) return `url:${mediaKind(value)}`;
  if (/^#[a-f0-9]{3,8}$/i.test(value) || /^(?:rgb|hsl)a?\(/i.test(value)) return 'color';
  if (/\b(?:radial|linear)-gradient\(/i.test(value)) return 'gradient';
  if (/\b(?:scale|translate|rotate|perspective)\(/i.test(value)) return 'transform';
  if (value.length > 24) return 'long-text';
  if (value.length > 3) return 'text';
  return 'short-text';
}

function extractDependencies(source) {
  const rawUrls = uniqueSorted(source.match(URL_PATTERN) ?? []);
  const sanitized = rawUrls.map((rawUrl) => {
    try {
      const url = new URL(rawUrl);
      const pathname = url.pathname.toLowerCase();
      const extension = pathname.match(/\.([a-z0-9]+)$/)?.[1] ?? null;
      return {
        host: url.host,
        kind: mediaKind(rawUrl),
        extension,
      };
    } catch {
      return { host: 'invalid', kind: 'other', extension: null };
    }
  });

  return {
    rawUrls,
    sanitized,
    counts: Object.fromEntries(
      ['image', 'video', 'audio', 'font', 'other'].map((kind) => [
        kind,
        sanitized.filter((dependency) => dependency.kind === kind).length,
      ]),
    ),
  };
}

function inferFamilies({ calls, jsxTags, styleProperties, rawSource }) {
  const families = new Set();
  if (jsxTags.has('ThreeCanvas') || calls.has('THREE.Shape') || /\bTHREE\./.test(rawSource)) families.add('three');
  if (jsxTags.has('canvas') || /\.getContext\s*\(/.test(rawSource)) families.add('canvas');
  if (jsxTags.has('Img') || calls.has('Img')) families.add('image');
  if (jsxTags.has('Video') || jsxTags.has('OffthreadVideo')) families.add('video');
  if (jsxTags.has('Audio')) families.add('audio');
  if (styleProperties.has('fontSize') || /<(?:span|pre|text)\b/i.test(rawSource)) families.add('text');
  if (/flash|grain|vignette|glitch|overlay/i.test(rawSource)) families.add('overlay');
  return [...families].sort();
}

function isReferenceIdentifier(node, parent, key) {
  if (!parent) return true;
  if (parent.type === 'VariableDeclarator' && key === 'id') return false;
  if (
    ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(parent.type)
    && key === 'params'
  ) return false;
  if ((parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && key === 'key' && !parent.computed) return false;
  if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && key === 'property' && !parent.computed) return false;
  if (parent.type.startsWith('JSX')) return false;
  return true;
}

function isRuntimeGlobal(name) {
  return [
    'React', 'useEffect', 'useState', 'useMemo', 'useRef', 'useCallback',
    'AbsoluteFill', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring',
    'Sequence', 'Series', 'Easing', 'Video', 'OffthreadVideo', 'Audio', 'Img',
    'AnimatedImage', 'ThreeCanvas', 'THREE', 'loadGoogleFont', 'Math',
  ].includes(name);
}
