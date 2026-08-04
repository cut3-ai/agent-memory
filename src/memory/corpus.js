import traverseModule from '@babel/traverse';

import { sha256, stableStringify } from '../lib.js';
import { numericDirection, parseComposition } from '../normalize.js';

const traverse = traverseModule.default ?? traverseModule;

export const CORPUS_RULESET_VERSION = 'stylistic-subtree-memory-census-v6';

const ENTRY_NAMES = Object.freeze([
  'GeneratedComposition',
  'Composition',
  'VideoComposition',
  'Root',
]);
const TEXT_TAGS = new Set(['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em']);
const IMAGE_TAGS = new Set(['img', 'Img', 'Image']);
const VIDEO_TAGS = new Set(['video', 'Video', 'OffthreadVideo']);
const AUDIO_TAGS = new Set(['audio', 'Audio']);
const TIMELINE_TAGS = new Set([
  'Sequence',
  'Series',
  'Series.Sequence',
  'TransitionSeries',
  'TransitionSeries.Sequence',
]);
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'clipPath', 'mask', 'filter', 'feGaussianBlur',
  'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feDisplacementMap',
  'feTurbulence', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR', 'feMerge',
  'feMergeNode', 'linearGradient', 'radialGradient', 'stop', 'pattern',
]);
const SCENE_ROOT_TAGS = new Set(['ThreeCanvas']);
const SCENE_TAGS = new Set([
  'mesh', 'group', 'primitive', 'ambientLight', 'directionalLight', 'pointLight',
  'spotLight', 'hemisphereLight', 'perspectiveCamera', 'orthographicCamera',
  'PerspectiveCamera', 'OrthographicCamera', 'boxGeometry', 'sphereGeometry',
  'planeGeometry', 'torusGeometry', 'torusKnotGeometry', 'cylinderGeometry',
  'coneGeometry', 'ringGeometry', 'bufferGeometry', 'meshBasicMaterial',
  'meshStandardMaterial', 'meshPhysicalMaterial', 'shaderMaterial', 'points',
  'pointsMaterial', 'Text3D', 'Sparkles', 'Float', 'Stars', 'Environment',
]);
const CONTROL_TYPES = new Set([
  'IfStatement', 'SwitchStatement', 'ConditionalExpression', 'LogicalExpression',
  'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement',
  'DoWhileStatement',
]);
const PROPERTY_CAPABILITIES = Object.freeze({
  background: 'paint.background',
  backgroundColor: 'paint.fill',
  backgroundPosition: 'paint.background-position',
  baseFrequency: 'procedural.turbulence-frequency',
  boxShadow: 'paint.shadow',
  color: 'paint.color',
  d: 'vector.path-morph',
  elapsed: 'procedural.progress',
  filter: 'paint.filter',
  fontSize: 'typography.size',
  frame: 'procedural.progress',
  geometry: 'scene.geometry',
  left: 'layout.position-x',
  opacity: 'style.opacity',
  panX: 'transform.translate-x',
  panY: 'transform.translate-y',
  progress: 'procedural.progress',
  rotate: 'transform.rotate',
  scale: 'transform.scale',
  seed: 'procedural.seed',
  src: 'media.source',
  stdDeviation: 'paint.blur-radius',
  strokeDashoffset: 'vector.stroke-progress',
  textShadow: 'typography.shadow',
  time: 'procedural.progress',
  top: 'layout.position-y',
  WebkitTextStroke: 'typography.stroke',
});
const PROPERTY_INFRASTRUCTURE_KIND = Object.freeze({
  opacity: 'behaviour.opacity',
  rotate: 'behaviour.rotate',
  scale: 'behaviour.scale',
});
const MOTIF_STYLE_PROPERTIES = new Set([
  ...Object.keys(PROPERTY_CAPABILITIES),
  'alignItems', 'border', 'borderColor', 'borderRadius', 'borderWidth',
  'bottom', 'display', 'flexDirection', 'fontFamily', 'fontWeight', 'gap',
  'height', 'inset', 'justifyContent', 'lineHeight', 'margin', 'objectFit',
  'overflow', 'padding', 'position', 'right', 'textAlign', 'transform',
  'transformOrigin', 'width', 'zIndex',
]);
const AUTHORED_STYLE_PROPERTIES = new Set([
  'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius',
  'borderWidth', 'boxShadow', 'color', 'filter', 'fontFamily', 'fontSize',
  'fontStyle', 'fontWeight', 'letterSpacing', 'lineHeight', 'mixBlendMode',
  'textAlign', 'textShadow', 'textTransform', 'WebkitTextStroke',
]);

/** Parse workspace JSONL without importing either legacy CBA implementation. */
export function buildCorpusCensus(inputText) {
  const ingested = ingestCompositionTracks(inputText);
  if (ingested.errors.length > 0) {
    throw new Error(`Dataset ingestion failed with ${ingested.errors.length} errors`);
  }
  const compositions = ingested.compositions.map(analyzeComposition);
  const units = compositions.flatMap((item) => item.units);
  const behaviours = compositions.flatMap((item) => item.behaviours);
  const candidates = compositions.flatMap((item) => item.candidates);
  const helpers = compositions.flatMap((item) => item.helpers);
  const body = {
    schemaVersion: 6,
    rulesetVersion: CORPUS_RULESET_VERSION,
    corpusSha256: sha256(String(inputText ?? '')),
    counts: {
      workspaces: ingested.stats.workspaces,
      workspacesWithCompositions: ingested.stats.workspacesWithCompositions,
      compositions: compositions.length,
      uniqueSources: new Set(compositions.map((item) => item.sourceHash)).size,
      uniqueStructuralSources: new Set(compositions.map((item) => item.structuralHash)).size,
      renderModes: countValues(compositions.map((item) => item.renderMode)),
      unitWitnesses: units.length,
      mappedUnitWitnesses: 0,
      infrastructureUnitWitnesses: units.filter((item) => item.infrastructureKind).length,
      atomicBehaviourWitnesses: behaviours.length,
      mappedBehaviourWitnesses: 0,
      infrastructureBehaviourWitnesses: behaviours.filter(
        (item) => item.infrastructureKind,
      ).length,
      structuralReclassifications: behaviours.filter(
        (item) => item.status === 'structural-reclassification',
      ).length,
      imperativeResiduals: behaviours.filter(
        (item) => item.status === 'imperative-residual',
      ).length,
      visualSinks: compositions.reduce((sum, item) => sum + item.visualSinks, 0),
      controlStatements: compositions.reduce((sum, item) => sum + item.controlStatements, 0),
      helperDeclarations: helpers.length,
      rejectedNonVisualHelperDeclarations: helpers.filter(
        (item) => item.category === 'non-visual',
      ).length,
      numericHelperBehaviourCandidates: 0,
      combinedVisualBehaviourCandidates: 0,
      cardinalitySpecificUnitCandidates: 0,
      stylisticUnitCandidateWitnesses: candidates.filter(
        (item) => item.kind === 'unit',
      ).length,
      stylisticBehaviourCandidateWitnesses: candidates.filter(
        (item) => item.kind === 'behaviour',
      ).length,
    },
    units: summarizeWitnesses(units),
    behaviours: summarizeWitnesses(behaviours),
    formulaKinds: countValues(behaviours.map((item) => item.formulaKind)),
    helperKinds: countValues(helpers.map((item) => item.category)),
    memoryCandidates: summarizeCandidates(candidates),
    compositions: compositions.map(publicComposition),
  };
  return deepFreeze({
    ...body,
    censusSha256: sha256(stableStringify(body)),
  });
}

export function ingestCompositionTracks(inputText) {
  const compositions = [];
  const errors = [];
  const lines = String(inputText ?? '').split(/\r?\n/);
  let workspaces = 0;
  let workspacesWithCompositions = 0;
  let tracks = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].trim()) continue;
    let workspace;
    try {
      workspace = JSON.parse(lines[lineIndex]);
    } catch {
      errors.push({ line: lineIndex + 1, code: 'invalid-json' });
      continue;
    }
    workspaces += 1;
    if (!isRecord(workspace) || !Array.isArray(workspace.tracks)) {
      errors.push({ line: lineIndex + 1, code: 'invalid-workspace' });
      continue;
    }
    tracks += workspace.tracks.length;
    const selected = workspace.tracks.filter((track) => track?.type === 'composition');
    if (selected.length > 0) workspacesWithCompositions += 1;
    selected.forEach((track, selectedIndex) => {
      const trackIndex = workspace.tracks.indexOf(track);
      if (typeof track.source !== 'string' || !track.source.trim()) {
        errors.push({ line: lineIndex + 1, trackIndex, code: 'composition-source-missing' });
        return;
      }
      const fps = finite(workspace.fps);
      const lengthMs = finite(track.length);
      if (!(fps > 0) || !(lengthMs >= 0)) {
        errors.push({ line: lineIndex + 1, trackIndex, code: 'invalid-timeline' });
        return;
      }
      compositions.push({
        workspaceIndex: lineIndex,
        trackIndex,
        selectedIndex,
        fps,
        width: finite(workspace.width) ?? 0,
        height: finite(workspace.height) ?? 0,
        lengthMs,
        source: track.source,
      });
    });
  }
  return {
    compositions,
    errors,
    stats: { workspaces, workspacesWithCompositions, tracks },
  };
}

function analyzeComposition(record) {
  const parsed = parseComposition(record.source);
  const sourceHash = sha256(record.source);
  const workspaceKey = `workspace-${sha256(String(record.workspaceIndex)).slice(0, 12)}`;
  const compositionKey = `composition-${sha256([
    workspaceKey,
    record.trackIndex,
    sourceHash,
  ].join(':')).slice(0, 20)}`;
  const reachable = findReachableFunctions(parsed.ast);
  const units = [];
  const behaviours = [];
  const provisionalCandidates = [];
  const seenControls = new WeakSet();
  let controlStatements = 0;
  let visualSinks = 0;

  const addUnit = (node, classification, origin) => {
    units.push({
      witness: witnessId(compositionKey, 'unit', node?.start, units.length),
      workspaceKey,
      compositionKey,
      sourceKind: origin,
      ...classification,
    });
  };
  const addBehaviour = (node, classification, valuePath = null, sourceKind = 'ast.visual-write') => {
    behaviours.push({
      witness: witnessId(compositionKey, 'behaviour', node?.start, behaviours.length),
      workspaceKey,
      compositionKey,
      sourceKind,
      formulaKind: valuePath ? classifyFormula(valuePath) : 'imperative',
      ...classification,
    });
    if (valuePath) {
      const temporalCandidate = classifyTemporalCandidate(valuePath, classification);
      if (temporalCandidate) {
        provisionalCandidates.push(candidateWitness(
          compositionKey,
          workspaceKey,
          node,
          temporalCandidate,
          provisionalCandidates.length,
        ));
      }
    }
  };
  const addControlUnit = (path, kind) => {
    if (seenControls.has(path.node)) return;
    seenControls.add(path.node);
    addUnit(path.node, kind === 'repeat'
      ? mapped('structure.repeat', 'unit.repeat')
      : mapped('structure.switch', 'unit.switch'), `syntax.${kind}`);
  };

  traverse(parsed.ast, {
    enter(path) {
      if (isReachablePath(path, reachable) && CONTROL_TYPES.has(path.node.type)) {
        controlStatements += 1;
      }
    },
    JSXElement(path) {
      if (!isReachablePath(path, reachable)) return;
      const opening = path.get('openingElement');
      const tag = jsxName(path.node.openingElement.name);
      const classification = classifyUnit(path, tag);
      addUnit(path.node, classification, `jsx.${classification.syntax}`);
      const style = findJsxStyleObject(opening);
      visualSinks += analyzeStyleObject({
        style,
        source: parsed.stripped,
        addBehaviour,
      });
      visualSinks += analyzeJsxAttributes(opening, addBehaviour);
      visualSinks += analyzeDynamicChildren(path, addBehaviour);
      const candidate = classifyCompositeCandidate(path, tag, style, parsed.stripped);
      if (candidate) {
        provisionalCandidates.push(candidateWitness(
          compositionKey,
          workspaceKey,
          path.node,
          candidate,
          provisionalCandidates.length,
        ));
      }
    },
    JSXFragment(path) {
      if (!isReachablePath(path, reachable)) return;
      addUnit(path.node, mapped('structure.group', 'unit.group'), 'jsx.fragment');
    },
    ConditionalExpression(path) {
      if (isReachablePath(path, reachable) && subtreeContainsRenderable(path)) {
        addControlUnit(path, 'switch');
      }
    },
    LogicalExpression(path) {
      if (isReachablePath(path, reachable) && subtreeContainsRenderable(path)) {
        addControlUnit(path, 'switch');
      }
    },
    IfStatement(path) {
      if (isReachablePath(path, reachable) && subtreeContainsRenderable(path)) {
        addControlUnit(path, 'switch');
      }
    },
    CallExpression(path) {
      if (!isReachablePath(path, reachable)) return;
      if (isRenderableMap(path)) addControlUnit(path, 'repeat');
      if (isReactCreateElement(path.node)) {
        const classification = classifyElementType(path.node.arguments[0]);
        addUnit(path.node, classification, `call.${classification.syntax}`);
        const props = resolveObjectPath(path.get('arguments.1'));
        visualSinks += analyzeCreateElementProps(props, addBehaviour, parsed.stripped);
      }
      const effectKind = effectCallKind(path.node.callee);
      if (effectKind) {
        const callback = path.get('arguments.0');
        if (effectKind === 'scene-frame' || pathDependsOnFrame(callback)) {
          const classification = classifyImperativeEffect(callback, effectKind);
          addBehaviour(path.node, classification, null, `ast.${effectKind}`);
          visualSinks += 1;
        }
      }
    },
  });

  return {
    compositionKey,
    workspaceKey,
    sourceHash,
    structuralHash: structuralAstHash(parsed.ast.program),
    frameCount: Math.max(1, Math.ceil(record.lengthMs / 1000 * record.fps)),
    renderMode: inferRenderMode(units),
    controlStatements,
    visualSinks,
    units,
    behaviours,
    candidates: keepSmallestConnectedCandidates(provisionalCandidates),
    helpers: classifyHelperDeclarations(parsed.ast),
  };
}

function classifyUnit(path, tag) {
  if (tag === 'AbsoluteFill') return { ...mapped('structure.layer', 'unit.layer'), syntax: 'layer' };
  if (TIMELINE_TAGS.has(tag)) return { ...mapped('timeline.clip', 'unit.sequence'), syntax: 'timeline' };
  if (IMAGE_TAGS.has(tag)) return { ...mapped('media.image', 'unit.image'), syntax: 'image' };
  if (VIDEO_TAGS.has(tag)) return { ...mapped('media.video', 'unit.video'), syntax: 'video' };
  if (AUDIO_TAGS.has(tag)) return { ...mapped('media.audio', 'unit.audio'), syntax: 'audio' };
  if (tag === 'canvas') return { ...mapped('visual.raster-root', 'unit.canvas'), syntax: 'raster-root' };
  if (tag === 'svg') return { ...mapped('visual.vector-root', 'unit.svg'), syntax: 'vector-root' };
  if (SCENE_ROOT_TAGS.has(tag)) {
    return { ...mapped('visual.scene-root', 'unit.three-scene'), syntax: 'scene-root' };
  }
  if (insideFamily(path, 'svg') || SVG_TAGS.has(tag)) {
    return { ...residual('visual.vector-element', 'typed-vector-unit-required'), syntax: 'vector-element' };
  }
  if (insideScene(path) || SCENE_TAGS.has(tag)) {
    return { ...residual('visual.scene-element', 'typed-scene-unit-required'), syntax: 'scene-element' };
  }
  if (/^[A-Z]/.test(tag)) {
    return { ...residual('visual.local-composite', 'recursive-class-extraction-required'), syntax: 'component' };
  }
  if (TEXT_TAGS.has(tag)) return { ...mapped('content.text', 'unit.text'), syntax: 'text' };
  return { ...residual('visual.container', 'typed-container-unit-required'), syntax: 'container' };
}

function classifyElementType(node) {
  const tag = elementTypeName(node);
  if (tag === 'AbsoluteFill') return { ...mapped('structure.layer', 'unit.layer'), syntax: 'layer' };
  if (IMAGE_TAGS.has(tag)) return { ...mapped('media.image', 'unit.image'), syntax: 'image' };
  if (VIDEO_TAGS.has(tag)) return { ...mapped('media.video', 'unit.video'), syntax: 'video' };
  if (AUDIO_TAGS.has(tag)) return { ...mapped('media.audio', 'unit.audio'), syntax: 'audio' };
  if (TEXT_TAGS.has(tag)) return { ...mapped('content.text', 'unit.text'), syntax: 'text' };
  return /^[A-Z]/.test(tag)
    ? { ...residual('visual.local-composite', 'recursive-class-extraction-required'), syntax: 'component' }
    : { ...residual('visual.container', 'typed-container-unit-required'), syntax: 'container' };
}

function analyzeStyleObject({ style, source, addBehaviour }) {
  if (!style) return 0;
  if (!style.isObjectExpression()) {
    if (!pathDependsOnFrame(style)) return 0;
    addBehaviour(
      style.node,
      visualResidual('visual.dynamic-style', 'style-object-decomposition-required'),
      style,
      'style.dynamic-object',
    );
    return 1;
  }
  let sinks = 0;
  for (const property of style.get('properties')) {
    if (property.isSpreadElement()) {
      const value = property.get('argument');
      if (pathDependsOnFrame(value)) {
        addBehaviour(
          property.node,
          visualResidual('visual.dynamic-style', 'style-spread-decomposition-required'),
          value,
          'style.spread',
        );
        sinks += 1;
      }
      continue;
    }
    if (!property.isObjectProperty()) continue;
    const value = property.get('value');
    if (!pathDependsOnFrame(value)) continue;
    const name = propertyName(property.node.key);
    if (name === 'transform') {
      const operations = transformOperations(resolveObjectPath(value), source);
      if (operations.length === 0) {
        addBehaviour(
          property.node,
          visualResidual('transform.composite', 'transform-grammar-residual'),
          value,
          'style.transform',
        );
        sinks += 1;
      } else {
        operations.forEach((operation) => addBehaviour(
          property.node,
          mappedVisual(`transform.${operation}`, `behaviour.${operation}`),
          value,
          `style.transform.${operation}`,
        ));
        sinks += 1;
      }
      continue;
    }
    addBehaviour(property.node, classifyProperty(name), value, `style.${safeProperty(name)}`);
    sinks += 1;
  }
  return sinks;
}

function analyzeJsxAttributes(opening, addBehaviour) {
  let sinks = 0;
  for (const attribute of opening.get('attributes')) {
    if (attribute.isJSXSpreadAttribute()) {
      const value = attribute.get('argument');
      if (pathDependsOnFrame(value)) {
        addBehaviour(
          attribute.node,
          visualResidual('visual.dynamic-props', 'prop-spread-decomposition-required'),
          value,
          'attribute.spread',
        );
        sinks += 1;
      }
      continue;
    }
    if (!attribute.isJSXAttribute()) continue;
    const name = jsxName(attribute.node.name);
    if (name === 'style') continue;
    const valueContainer = attribute.get('value');
    if (!valueContainer.isJSXExpressionContainer()) continue;
    const value = valueContainer.get('expression');
    if (!pathDependsOnFrame(value)) continue;
    addBehaviour(attribute.node, classifyProperty(name), value, `attribute.${safeProperty(name)}`);
    sinks += 1;
  }
  return sinks;
}

function analyzeDynamicChildren(elementPath, addBehaviour) {
  let sinks = 0;
  for (const child of elementPath.get('children')) {
    if (!child.isJSXExpressionContainer()) continue;
    const value = child.get('expression');
    if (subtreeContainsRenderable(value) || !pathDependsOnFrame(value)) continue;
    addBehaviour(
      child.node,
      visualResidual('content.dynamic', 'typed-content-behaviour-required'),
      value,
      'content.dynamic',
    );
    sinks += 1;
  }
  return sinks;
}

function analyzeCreateElementProps(props, addBehaviour, source) {
  if (!props?.isObjectExpression()) return 0;
  let sinks = 0;
  for (const property of props.get('properties')) {
    if (!property.isObjectProperty()) continue;
    const name = propertyName(property.node.key);
    const value = property.get('value');
    if (name === 'style') {
      sinks += analyzeStyleObject({ style: resolveObjectPath(value), source, addBehaviour });
    } else if (pathDependsOnFrame(value)) {
      addBehaviour(property.node, classifyProperty(name), value, `property.${safeProperty(name)}`);
      sinks += 1;
    }
  }
  return sinks;
}

function classifyProperty(name) {
  if (name === 'key') {
    return {
      capability: 'structure.identity-change',
      status: 'structural-reclassification',
      residualCode: 'switch-or-clip-required',
      visual: false,
    };
  }
  const capability = PROPERTY_CAPABILITIES[name] ?? 'visual.dynamic-property';
  const infrastructureKind = PROPERTY_INFRASTRUCTURE_KIND[name] ?? null;
  return infrastructureKind
    ? mappedVisual(capability, infrastructureKind)
    : visualResidual(capability, 'typed-property-behaviour-required');
}

function classifyImperativeEffect(callback, effectKind) {
  let raster = false;
  let scene = effectKind === 'scene-frame';
  if (callback?.node) {
    walk(callback.node, (node) => {
      if (!['CallExpression', 'NewExpression', 'MemberExpression'].includes(node.type)) return;
      const name = calleeName(node.callee ?? node);
      if (/^(?:ctx\.|canvas\.|CanvasRenderingContext)/.test(name)) raster = true;
      if (/^(?:THREE\.|meshRef|groupRef|materialRef)/.test(name)
          || /\.(?:rotation|position|quaternion|uniforms)$/.test(name)) scene = true;
    });
  }
  if (raster) {
    return imperativeResidual(
      'visual.raster-graph',
      'retained-raster-decomposition-required',
    );
  }
  if (scene) {
    return imperativeResidual(
      'visual.scene-mutation',
      'typed-scene-behaviour-required',
    );
  }
  return imperativeResidual('visual.lifecycle', 'typed-lifecycle-behaviour-required');
}

function classifyCompositeCandidate(path, tag, style, source) {
  const directStyle = sourceSlice(source, style?.node);
  const localSource = sourceSlice(source, path.node);
  const directChildren = (path.node.children ?? [])
    .filter((child) => child.type === 'JSXElement').length;
  const facts = descendantFacts(path.node);
  const styles = motifStyleProperties(path.node);
  const directStyles = stylePropertyNames(style?.node);
  const authoredStyles = styles.filter((name) => AUTHORED_STYLE_PROPERTIES.has(name));
  const authoredAtRoot = directStyles.filter((name) => AUTHORED_STYLE_PROPERTIES.has(name));
  const rootIsContainer = /^(?:article|aside|div|figure|section)$/u.test(tag);
  const fullFrame = tag === 'AbsoluteFill'
    || (/position\s*:\s*["'](?:absolute|fixed)["']/u.test(directStyle)
      && (/inset\s*:\s*0\b/u.test(directStyle)
        || (/top\s*:\s*0\b/u.test(directStyle)
          && /left\s*:\s*0\b/u.test(directStyle)
          && /width\s*:\s*["']100%["']/u.test(directStyle)
          && /height\s*:\s*["']100%["']/u.test(directStyle))));
  const coherent = rootIsContainer
    && !fullFrame
    && directChildren >= 1
    && facts.text
    && styles.length >= 3
    && authoredStyles.length >= 2
    && authoredAtRoot.length >= 1;
  if (!coherent) return null;

  let family = null;
  if (/\b(?:rank(?:ing)?|rankNumber|rankLabel|countdown|top\s*\d+)\b/iu.test(localSource)
      && directChildren >= 2) family = 'ranking-card';
  else if (/\b(?:dialogue|subtitle|caption|speech|speaker)\b/iu.test(localSource)
      && styles.some((name) => ['background', 'backgroundColor', 'boxShadow'].includes(name))) {
    family = 'dialogue-card';
  } else if (/\b(?:chunks?|words?|tokens?)\b/iu.test(localSource)
      && /\b(?:start|end|delay|offset|timing)(?:Ms|Frame|Time)?\b/u.test(localSource)
      && styles.includes('position')) family = 'timed-text-card';
  if (!family) return null;

  // Content is value data. Tree identity records only element/attribute shape,
  // so JSXText and expression payload changes do not manufacture new classes.
  const structuralHash = sha256(stableStringify(jsxTreeShape(path.node)));
  const fingerprint = motifStyleFingerprint(path);
  return {
    kind: 'unit',
    family,
    structuralHash,
    styleFingerprintSha256: fingerprint.sha256,
    styleFingerprintProven: fingerprint.proven,
    identityFingerprintSha256: fingerprint.sha256,
    identityFingerprintProven: fingerprint.proven,
    identityBasis: 'connected-styled-subtree',
    treeEvidence: {
      boundary: 'connected-jsx-subtree',
      connected: true,
      directChildren,
      styleProperties: styles.length,
    },
  };
}

function classifyTemporalCandidate(valuePath, classification) {
  const facts = temporalFacts(valuePath);
  const hasAuthoredShape = facts.shapes.some(isStagedNonLinearShape);
  // Bare spring()/sin()/cos are foundation timing mechanics. A memory
  // Behaviour needs an additional authored, non-monotonic multi-stage law;
  // otherwise the class would only wrap a Signal or another library call.
  if (!hasAuthoredShape) return null;
  let family = null;
  if (facts.drivers.includes('spring')) family = 'shaped-spring-law';
  else if (facts.drivers.includes('oscillation')) family = 'shaped-oscillatory-law';
  else if (facts.drivers.includes('keyframes')) family = 'staged-curve';
  if (!family) return null;

  const channel = temporalChannel(classification);
  const fingerprint = sha256(stableStringify({
    family,
    channel,
    drivers: facts.drivers,
    shapes: facts.shapes,
    formula: canonicalFormulaClosure(valuePath),
  }));
  return {
    kind: 'behaviour',
    family,
    channel,
    structuralHash: sha256(stableStringify({ family, channel, ...facts })),
    temporalFingerprintSha256: fingerprint,
    temporalFingerprintProven: true,
    identityFingerprintSha256: fingerprint,
    identityFingerprintProven: true,
    identityBasis: 'single-stylistic-channel-law',
    temporalEvidence: {
      boundary: 'single-stylistic-channel-law',
      singleChannel: true,
      drivers: facts.drivers,
      shapes: facts.shapes,
    },
  };
}

function temporalFacts(valuePath) {
  const drivers = new Set();
  const shapes = new Set();
  const seenBindings = new Set();
  const followBinding = (identifierPath) => {
    const binding = identifierPath.scope.getBinding(identifierPath.node.name);
    if (!binding || seenBindings.has(binding)) return;
    const nested = bindingValuePath(binding);
    if (!nested?.node) return;
    seenBindings.add(binding);
    visit(nested);
  };
  const visit = (path) => {
    if (!path?.node) return;
    const inspect = (node) => {
      if (!['CallExpression', 'OptionalCallExpression'].includes(node.type)) return;
      const name = calleeName(node.callee);
      if (name === 'spring') drivers.add('spring');
      if (name === 'Math.sin' || name === 'Math.cos') drivers.add('oscillation');
      if (name !== 'interpolate') return;
      drivers.add('keyframes');
      const values = numericArrayValues(node.arguments?.[2]);
      if (values) shapes.add(`${numericDirection(values)}-${values.length}-points`);
    };
    inspect(path.node);
    walk(path.node, inspect);
    if (path.isReferencedIdentifier()) followBinding(path);
    path.traverse({
      ReferencedIdentifier(identifierPath) {
        followBinding(identifierPath);
      },
    });
  };
  visit(valuePath);
  return {
    drivers: [...drivers].sort(),
    shapes: [...shapes].sort(),
  };
}

function numericArrayValues(node) {
  if (node?.type !== 'ArrayExpression') return null;
  const values = node.elements.map((element) => {
    if (element?.type === 'NumericLiteral') return element.value;
    if (element?.type === 'UnaryExpression'
        && element.operator === '-'
        && element.argument?.type === 'NumericLiteral') return -element.argument.value;
    return null;
  });
  return values.length > 0 && values.every((value) => value !== null) ? values : null;
}

function isStagedNonLinearShape(shape) {
  const match = /^(?:mixed|peak|valley)-(\d+)-points$/u.exec(String(shape));
  return Boolean(match && Number(match[1]) >= 4);
}

function temporalChannel(classification) {
  const infrastructure = classification.infrastructureKind;
  if (infrastructure === 'behaviour.opacity') return 'opacity';
  if (infrastructure === 'behaviour.scale') return 'transform.scale';
  if (infrastructure === 'behaviour.translate') return 'transform.translate';
  if (infrastructure === 'behaviour.rotate') return 'transform.rotate';
  return classification.capability ?? 'visual.dynamic-property';
}

function candidateWitness(compositionKey, workspaceKey, node, candidate, index) {
  const candidateKind = `${candidate.kind}.${candidate.family}.${candidate.identityFingerprintSha256.slice(0, 12)}`;
  return {
    witness: witnessId(compositionKey, 'candidate', node?.start, index),
    compositionKey,
    workspaceKey,
    kind: candidate.kind,
    family: candidate.family,
    candidateKind,
    identityBasis: candidate.identityBasis,
    identityFingerprintSha256: candidate.identityFingerprintSha256,
    identityFingerprintProven: candidate.identityFingerprintProven,
    structuralHash: candidate.structuralHash,
    boundarySpan: candidateSpan(node),
    ...(candidate.styleFingerprintSha256 ? {
      styleFingerprintSha256: candidate.styleFingerprintSha256,
      styleFingerprintProven: candidate.styleFingerprintProven,
    } : {}),
    ...(candidate.temporalFingerprintSha256 ? {
      temporalFingerprintSha256: candidate.temporalFingerprintSha256,
      temporalFingerprintProven: candidate.temporalFingerprintProven,
      channel: candidate.channel,
    } : {}),
    ...(candidate.treeEvidence ? { treeEvidence: candidate.treeEvidence } : {}),
    ...(candidate.temporalEvidence ? { temporalEvidence: candidate.temporalEvidence } : {}),
    variantHash: sha256(stableStringify(stripAstMetadata(node, false))),
  };
}

function keepSmallestConnectedCandidates(candidates) {
  return candidates.filter((candidate) => {
    if (candidate.kind !== 'unit' || candidate.identityBasis !== 'connected-styled-subtree') {
      return true;
    }
    return !candidates.some((nested) => (
      nested !== candidate
      && nested.kind === 'unit'
      && nested.identityBasis === 'connected-styled-subtree'
      && nested.family === candidate.family
      && strictlyContains(candidate.boundarySpan, nested.boundarySpan)
    ));
  });
}

function candidateSpan(node) {
  return Number.isInteger(node?.start) && Number.isInteger(node?.end)
    ? { start: node.start, end: node.end }
    : null;
}

function strictlyContains(outer, inner) {
  return Number.isInteger(outer?.start)
    && Number.isInteger(outer?.end)
    && Number.isInteger(inner?.start)
    && Number.isInteger(inner?.end)
    && outer.start <= inner.start
    && outer.end >= inner.end
    && (outer.start < inner.start || outer.end > inner.end);
}

function motifStyleProperties(node) {
  const names = new Set();
  walk(node, (nested) => {
    if (nested.type !== 'JSXAttribute' || jsxName(nested.name) !== 'style') return;
    const expression = nested.value?.type === 'JSXExpressionContainer'
      ? nested.value.expression
      : nested.value;
    stylePropertyNames(expression).forEach((name) => names.add(name));
  });
  return [...names].sort();
}

function stylePropertyNames(node) {
  if (node?.type !== 'ObjectExpression') return [];
  return node.properties.flatMap((property) => {
    if (property.type !== 'ObjectProperty' || property.computed) return [];
    const name = propertyName(property.key);
    return MOTIF_STYLE_PROPERTIES.has(name) ? [name] : [];
  }).sort();
}

function motifStyleFingerprint(elementPath) {
  const styles = [];
  const temporalLaws = [];
  let proven = true;
  elementPath.traverse({
    JSXAttribute(attributePath) {
      if (jsxName(attributePath.node.name) !== 'style') return;
      const value = attributePath.get('value');
      if (!value.isJSXExpressionContainer()) {
        proven = false;
        return;
      }
      const expression = resolveObjectPath(value.get('expression'));
      if (!expression?.isObjectExpression()) {
        proven = false;
        return;
      }
      if (expression.node.properties.some((property) => property.type === 'SpreadElement')) {
        proven = false;
      }
      styles.push(canonicalStyleAst(expression.node));
      for (const property of expression.get('properties')) {
        if (!property.isObjectProperty()) continue;
        const propertyValue = property.get('value');
        if (!pathDependsOnFrame(propertyValue)) continue;
        temporalLaws.push({
          property: propertyName(property.node.key),
          formula: canonicalFormulaClosure(propertyValue),
        });
      }
    },
  });
  if (styles.length === 0) proven = false;
  return {
    sha256: sha256(stableStringify({
      treeShape: jsxTreeShape(elementPath.node),
      styles: styles.sort((left, right) => (
        stableStringify(left).localeCompare(stableStringify(right))
      )),
      temporalLaws: temporalLaws.sort((left, right) => (
        left.property.localeCompare(right.property)
        || stableStringify(left.formula).localeCompare(stableStringify(right.formula))
      )),
    })),
    proven,
  };
}

function jsxTreeShape(node) {
  if (node?.type === 'JSXElement') {
    return {
      kind: 'element',
      tag: jsxName(node.openingElement?.name),
      attributes: (node.openingElement?.attributes ?? []).map((attribute) => (
        attribute.type === 'JSXAttribute' ? jsxName(attribute.name) : '...'
      )).sort(),
      children: (node.children ?? []).flatMap((child) => {
        if (child.type === 'JSXText') return child.value.trim() ? ['content'] : [];
        if (child.type === 'JSXExpressionContainer') {
          return child.expression?.type === 'JSXEmptyExpression' ? [] : ['content'];
        }
        const nested = jsxTreeShape(child);
        return nested ? [nested] : [];
      }),
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

function canonicalStyleAst(node) {
  return sortObjectProperties(stripAstMetadata(node, false));
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
  return propertyName(node?.key);
}

function canonicalFormulaClosure(valuePath) {
  const dependencies = [];
  const seen = new Set();
  const collect = (path) => {
    if (!path?.node) return;
    if (path.isReferencedIdentifier()) {
      const binding = path.scope.getBinding(path.node.name);
      if (binding && !seen.has(binding)) {
        const nested = bindingValuePath(binding);
        if (nested?.node) {
          seen.add(binding);
          dependencies.push(stripAstMetadata(nested.node, false));
          collect(nested);
        }
      }
    }
    path.traverse({
      ReferencedIdentifier(identifierPath) {
        const binding = identifierPath.scope.getBinding(identifierPath.node.name);
        if (!binding || seen.has(binding)) return;
        const nested = bindingValuePath(binding);
        if (!nested?.node) return;
        seen.add(binding);
        dependencies.push(stripAstMetadata(nested.node, false));
        collect(nested);
      },
    });
  };
  collect(valuePath);
  return {
    expression: stripAstMetadata(valuePath.node, false),
    dependencies: dependencies.sort((left, right) => (
      stableStringify(left).localeCompare(stableStringify(right))
    )),
  };
}

function publicComposition(composition) {
  const mappedUnits = 0;
  const mappedBehaviours = 0;
  const infrastructureUnits = composition.units.filter(
    (item) => item.infrastructureKind,
  ).length;
  const infrastructureBehaviours = composition.behaviours.filter(
    (item) => item.infrastructureKind,
  ).length;
  const body = {
    compositionKey: composition.compositionKey,
    workspaceKey: composition.workspaceKey,
    frameCount: composition.frameCount,
    renderMode: composition.renderMode,
    controlStatements: composition.controlStatements,
    visualSinks: composition.visualSinks,
    unitWitnesses: composition.units.length,
    mappedUnitWitnesses: mappedUnits,
    infrastructureUnitWitnesses: infrastructureUnits,
    residualUnitWitnesses: composition.units.length - mappedUnits - infrastructureUnits,
    behaviourWitnesses: composition.behaviours.length,
    mappedBehaviourWitnesses: mappedBehaviours,
    infrastructureBehaviourWitnesses: infrastructureBehaviours,
    residualBehaviourWitnesses: composition.behaviours.filter(
      (item) => !item.infrastructureKind,
    ).length,
    structuralReclassifications: composition.behaviours.filter(
      (item) => item.status === 'structural-reclassification',
    ).length,
    imperativeResiduals: composition.behaviours.filter(
      (item) => item.status === 'imperative-residual',
    ).length,
    candidateWitnesses: composition.candidates.length,
  };
  return { ...body, evidenceSha256: sha256(stableStringify(body)) };
}

function summarizeWitnesses(witnesses) {
  const grouped = new Map();
  for (const witness of witnesses) {
    const key = stableStringify({
      sourceKind: witness.sourceKind,
      capability: witness.capability,
      infrastructureKind: witness.infrastructureKind ?? null,
      status: witness.status,
      residualCode: witness.residualCode ?? null,
    });
    const current = grouped.get(key) ?? {
      sourceKind: witness.sourceKind,
      capability: witness.capability,
      infrastructureKind: witness.infrastructureKind ?? null,
      status: witness.status,
      residualCode: witness.residualCode ?? null,
      witnesses: 0,
      workspaces: new Set(),
      compositions: new Set(),
    };
    current.witnesses += 1;
    current.workspaces.add(witness.workspaceKey);
    current.compositions.add(witness.compositionKey);
    grouped.set(key, current);
  }
  return [...grouped.values()].map((entry) => ({
    sourceKind: entry.sourceKind,
    capability: entry.capability,
    infrastructureKind: entry.infrastructureKind,
    status: entry.status,
    ...(entry.residualCode ? { residualCode: entry.residualCode } : {}),
    witnesses: entry.witnesses,
    workspaces: entry.workspaces.size,
    compositions: entry.compositions.size,
  })).sort((left, right) => (
    left.capability.localeCompare(right.capability)
    || left.sourceKind.localeCompare(right.sourceKind)
  ));
}

function summarizeCandidates(witnesses) {
  const grouped = new Map();
  for (const witness of witnesses) {
    const current = grouped.get(witness.candidateKind) ?? {
      kind: witness.kind,
      family: witness.family,
      candidateKind: witness.candidateKind,
      identityBasis: witness.identityBasis,
      identityFingerprintSha256: witness.identityFingerprintSha256,
      identityFingerprintProven: true,
      styleFingerprintSha256: witness.styleFingerprintSha256,
      temporalFingerprintSha256: witness.temporalFingerprintSha256,
      channel: witness.channel,
      witnesses: 0,
      workspaces: new Set(),
      compositions: new Set(),
      structures: new Set(),
      variants: new Set(),
      drivers: new Set(),
      shapes: new Set(),
    };
    current.witnesses += 1;
    current.identityFingerprintProven &&= witness.identityFingerprintProven;
    current.workspaces.add(witness.workspaceKey);
    current.compositions.add(witness.compositionKey);
    current.structures.add(witness.structuralHash);
    current.variants.add(witness.variantHash);
    (witness.temporalEvidence?.drivers ?? []).forEach((value) => current.drivers.add(value));
    (witness.temporalEvidence?.shapes ?? []).forEach((value) => current.shapes.add(value));
    grouped.set(witness.candidateKind, current);
  }
  return [...grouped.values()].map((entry) => {
    const isUnit = entry.kind === 'unit';
    const independentReuse = entry.witnesses >= 2 && entry.workspaces.size >= 2;
    const evidenceReady = independentReuse
      && entry.identityFingerprintProven
      && entry.structures.size === 1;
    const blockers = [
      ...(!independentReuse ? ['insufficient-independent-workspaces'] : []),
      ...(!entry.identityFingerprintProven ? [isUnit
        ? 'style-fingerprint-unproven'
        : 'temporal-fingerprint-unproven'] : []),
      ...(entry.structures.size !== 1 ? [isUnit
        ? 'tree-shape-not-invariant'
        : 'temporal-signature-not-invariant'] : []),
      isUnit ? 'semantic-parameterization-unproven' : 'unit-attachment-contract-unproven',
      'executable-class-not-emitted',
      'reconstruction-not-proven',
      'human-feedback-not-provided',
    ];
    return {
      kind: entry.kind,
      family: entry.family,
      candidateKind: entry.candidateKind,
      boundary: entry.identityBasis,
      identityFingerprintSha256: entry.identityFingerprintSha256,
      ...(entry.styleFingerprintSha256 ? {
        styleFingerprintSha256: entry.styleFingerprintSha256,
      } : {}),
      ...(entry.temporalFingerprintSha256 ? {
        temporalFingerprintSha256: entry.temporalFingerprintSha256,
        channel: entry.channel,
        temporalEvidence: {
          singleChannel: true,
          drivers: [...entry.drivers].sort(),
          shapes: [...entry.shapes].sort(),
        },
      } : {}),
      witnesses: entry.witnesses,
      workspaces: entry.workspaces.size,
      compositions: entry.compositions.size,
      structuralVariants: entry.structures.size,
      valueVariants: entry.variants.size,
      independentReuse,
      eligibility: {
        evidenceReady,
        promotionEligible: false,
        blockers: [...new Set(blockers)].sort(),
      },
    };
  }).sort((left, right) => left.candidateKind.localeCompare(right.candidateKind));
}

function findReachableFunctions(ast) {
  const reachable = new Set();
  const queue = [];
  traverse(ast, {
    Program(path) {
      for (const name of ENTRY_NAMES) {
        const root = bindingFunctionPath(path.scope.getBinding(name));
        if (root) {
          queue.push(root);
          break;
        }
      }
      path.stop();
    },
  });
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current?.node || reachable.has(current.node)) continue;
    reachable.add(current.node);
    current.traverse({
      Function(path) {
        if (isInlineCallback(path)) queue.push(path);
        path.skip();
      },
      JSXOpeningElement(path) {
        const name = jsxName(path.node.name);
        if (!/^[A-Z]/.test(name)) return;
        const nested = bindingFunctionPath(path.scope.getBinding(name.split('.')[0]));
        if (nested) queue.push(nested);
      },
      CallExpression(path) {
        if (path.node.callee?.type === 'Identifier') {
          const nested = bindingFunctionPath(path.scope.getBinding(path.node.callee.name));
          if (nested) queue.push(nested);
        }
      },
    });
  }
  return reachable;
}

function bindingFunctionPath(binding) {
  if (!binding?.path) return null;
  if (binding.path.isFunctionDeclaration()) return binding.path;
  if (!binding.path.isVariableDeclarator()) return null;
  const init = binding.path.get('init');
  if (init?.isFunction()) return init;
  if (!init?.isCallExpression()) return null;
  const implementation = init.get('arguments')[0];
  return implementation?.isFunction() ? implementation : null;
}

function isInlineCallback(path) {
  const parent = path.parentPath;
  return parent?.isCallExpression()
    && parent.get('arguments').some((argument) => argument.node === path.node);
}

function isReachablePath(path, reachable) {
  const owner = path.getFunctionParent();
  return Boolean(owner && reachable.has(owner.node));
}

function pathDependsOnFrame(path, seen = new Set()) {
  if (!path?.node) return false;
  if (path.isCallExpression() && isFrameHook(path.node.callee)) return true;
  if (path.isReferencedIdentifier()) {
    const binding = path.scope.getBinding(path.node.name);
    if (binding && !seen.has(binding)) {
      const nested = bindingValuePath(binding);
      if (nested) {
        const next = new Set(seen).add(binding);
        if (pathDependsOnFrame(nested, next)) return true;
      }
    }
  }
  let dependent = false;
  path.traverse({
    CallExpression(inner) {
      if (isFrameHook(inner.node.callee)) {
        dependent = true;
        inner.stop();
      }
    },
    ReferencedIdentifier(inner) {
      if (dependent) return;
      const binding = inner.scope.getBinding(inner.node.name);
      if (!binding || seen.has(binding)) return;
      const nested = bindingValuePath(binding);
      if (nested && pathDependsOnFrame(nested, new Set(seen).add(binding))) {
        dependent = true;
        inner.stop();
      }
    },
  });
  return dependent;
}

function bindingValuePath(binding) {
  if (binding.path.isVariableDeclarator()) return binding.path.get('init');
  return null;
}

function classifyFormula(path) {
  const kinds = new Set();
  collectFormulaKinds(path, kinds, new Set());
  if (kinds.size === 0) return 'derived';
  return [...kinds].sort().join('+');
}

function collectFormulaKinds(path, output, seen) {
  if (!path?.node) return;
  const inspect = (nested) => {
    if (nested.type === 'CallExpression') {
      const name = calleeName(nested.callee);
      if (name === 'spring') output.add('spring');
      else if (name === 'interpolate') output.add('keyframes');
      else if (name === 'Math.sin' || name === 'Math.cos') output.add('oscillation');
      else if (isFrameHook(nested.callee)) output.add('frame-formula');
    }
  };
  inspect(path.node);
  walk(path.node, inspect);
  if (path.isReferencedIdentifier()) followFormulaBinding(path, output, seen);
  path.traverse({
    ReferencedIdentifier(inner) {
      followFormulaBinding(inner, output, seen);
    },
  });
}

function followFormulaBinding(path, output, seen) {
  const binding = path.scope.getBinding(path.node.name);
  if (!binding || seen.has(binding)) return;
  const nested = bindingValuePath(binding);
  if (!nested) return;
  seen.add(binding);
  collectFormulaKinds(nested, output, seen);
}

function findJsxStyleObject(opening) {
  const attribute = opening.get('attributes').find((item) => (
    item.isJSXAttribute() && jsxName(item.node.name) === 'style'
  ));
  if (!attribute) return null;
  const value = attribute.get('value');
  if (!value.isJSXExpressionContainer()) return null;
  return resolveObjectPath(value.get('expression'));
}

function resolveObjectPath(path, seen = new Set()) {
  if (!path?.node || !path.isIdentifier()) return path;
  const binding = path.scope.getBinding(path.node.name);
  if (!binding || seen.has(binding) || !binding.path.isVariableDeclarator()) return path;
  const init = binding.path.get('init');
  if (!init?.node) return path;
  seen.add(binding);
  return resolveObjectPath(init, seen);
}

function transformOperations(path, source) {
  const text = sourceSlice(source, path.node);
  const operations = [];
  for (const match of text.matchAll(/\b(scale(?:3d|x|y|z)?|translate(?:3d|x|y|z)?|rotate(?:3d|x|y|z)?)\s*\(/gi)) {
    const name = match[1].toLowerCase();
    operations.push(name.startsWith('scale')
      ? 'scale'
      : name.startsWith('translate') ? 'translate' : 'rotate');
  }
  return operations;
}

function isRenderableMap(path) {
  const node = path.node;
  const map = node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && node.callee.property?.name === 'map';
  const arrayFrom = calleeName(node.callee) === 'Array.from' && node.arguments.length >= 2;
  if (!map && !arrayFrom) return false;
  return path.get('arguments').some((argument) => (
    argument.isFunction() && subtreeContainsRenderable(argument)
  ));
}

function subtreeContainsRenderable(path) {
  if (!path?.node) return false;
  if (path.isJSXElement?.() || path.isJSXFragment?.() || isReactCreateElement(path.node)) return true;
  let found = false;
  path.traverse({
    JSXElement(inner) { found = true; inner.stop(); },
    JSXFragment(inner) { found = true; inner.stop(); },
    CallExpression(inner) {
      if (isReactCreateElement(inner.node)) {
        found = true;
        inner.stop();
      }
    },
  });
  return found;
}

function classifyHelperDeclarations(ast) {
  const output = [];
  for (const statement of ast.program.body) {
    if (statement.type === 'FunctionDeclaration') {
      if (!ENTRY_NAMES.includes(statement.id?.name)) {
        output.push({ category: helperCategory(statement) });
      }
      continue;
    }
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (ENTRY_NAMES.includes(declaration.id?.name)) continue;
      if (['ArrowFunctionExpression', 'FunctionExpression'].includes(declaration.init?.type)) {
        output.push({ category: helperCategory(declaration.init) });
      }
    }
  }
  return output;
}

function helperCategory(node) {
  let renderable = false;
  let imperative = false;
  walk(node, (nested) => {
    if (nested.type === 'JSXElement' || nested.type === 'JSXFragment') renderable = true;
    if (!['CallExpression', 'NewExpression'].includes(nested.type)) return;
    const name = calleeName(nested.callee);
    if (/^(?:ctx\.|canvas\.|document\.createElement|THREE\.|shape\.|s\.)/.test(name)
        || /^(?:draw|render|buildPath)/i.test(name)) imperative = true;
  });
  if (renderable) return 'renderable-builder';
  if (imperative) return 'imperative-visual';
  return 'non-visual';
}

function structuralAstHash(node) {
  return sha256(stableStringify(stripAstMetadata(node, true)));
}

function stripAstMetadata(value, abstractLiterals) {
  if (Array.isArray(value)) return value.map((item) => stripAstMetadata(item, abstractLiterals));
  if (!value || typeof value !== 'object') return value;
  if (abstractLiterals && ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(value.type)) {
    return { type: value.type, value: `<${value.type}>` };
  }
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (['start', 'end', 'loc', 'extra', 'comments', 'tokens', 'errors'].includes(key)) continue;
    output[key] = stripAstMetadata(nested, abstractLiterals);
  }
  return output;
}

function descendantFacts(node) {
  const facts = {
    media: false,
    text: false,
    custom: false,
    elements: false,
    dynamicContent: (node.children ?? []).some((child) => (
      child.type === 'JSXExpressionContainer'
      && child.expression?.type !== 'JSXEmptyExpression'
    )),
  };
  walk(node, (nested) => {
    if (nested.type === 'JSXText' && nested.value.trim()) facts.text = true;
    if (nested.type !== 'JSXOpeningElement' || nested === node.openingElement) return;
    facts.elements = true;
    const tag = jsxName(nested.name);
    if (IMAGE_TAGS.has(tag) || VIDEO_TAGS.has(tag) || AUDIO_TAGS.has(tag)) facts.media = true;
    if (TEXT_TAGS.has(tag)) facts.text = true;
    if (/^[A-Z]/.test(tag)) facts.custom = true;
  });
  return facts;
}

function hasStyleKey(style, names) {
  if (!style?.isObjectExpression()) return false;
  const allowed = new Set(names);
  return style.get('properties').some((property) => (
    property.isObjectProperty() && allowed.has(propertyName(property.node.key))
  ));
}

function insideFamily(path, tag) {
  let current = path.parentPath;
  while (current) {
    if (current.isJSXElement?.()
        && jsxName(current.node.openingElement.name) === tag) return true;
    current = current.parentPath;
  }
  return false;
}

function insideScene(path) {
  let current = path.parentPath;
  while (current) {
    if (current.isJSXElement?.()) {
      const tag = jsxName(current.node.openingElement.name);
      if (SCENE_ROOT_TAGS.has(tag) || SCENE_TAGS.has(tag)) return true;
    }
    current = current.parentPath;
  }
  return false;
}

function inferRenderMode(units) {
  const capabilities = new Set(units.map((item) => item.capability));
  if ([...capabilities].some((value) => value.startsWith('visual.scene'))) return 'scene';
  if ([...capabilities].some((value) => value.startsWith('visual.raster'))) return 'raster';
  if ([...capabilities].some((value) => value.startsWith('visual.vector'))) return 'vector';
  return 'native';
}

function effectCallKind(callee) {
  const name = calleeName(callee);
  if (name === 'useFrame') return 'scene-frame';
  if (['useEffect', 'React.useEffect'].includes(name)) return 'effect';
  if (['useLayoutEffect', 'React.useLayoutEffect'].includes(name)) return 'layout-effect';
  return null;
}

function isFrameHook(callee) {
  return ['useCurrentFrame', 'useFrame'].includes(calleeName(callee));
}

function isReactCreateElement(node) {
  return node?.type === 'CallExpression'
    && ['React.createElement', 'createElement'].includes(calleeName(node.callee));
}

function elementTypeName(node) {
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
  return '';
}

function propertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'StringLiteral' || node?.type === 'NumericLiteral') return String(node.value);
  return 'computed';
}

function safeProperty(value) {
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value) ? value : 'computed';
}

function sourceSlice(source, node) {
  return Number.isInteger(node?.start) && Number.isInteger(node?.end)
    ? source.slice(node.start, node.end)
    : '';
}

function walk(value, visitor, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (typeof value.type === 'string') visitor(value);
  for (const [key, nested] of Object.entries(value)) {
    if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
    if (Array.isArray(nested)) nested.forEach((item) => walk(item, visitor, seen));
    else walk(nested, visitor, seen);
  }
}

function countValues(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function witnessId(compositionKey, kind, start, index) {
  return sha256(`${compositionKey}:${kind}:${start ?? 'unknown'}:${index}`).slice(0, 24);
}

function mapped(capability, infrastructureKind) {
  return {
    capability,
    infrastructureKind,
    status: 'infrastructure-mapped',
  };
}

function residual(capability, residualCode) {
  return { capability, status: 'residual', residualCode };
}

function mappedVisual(capability, infrastructureKind) {
  return { ...mapped(capability, infrastructureKind), visual: true };
}

function visualResidual(capability, residualCode) {
  return { ...residual(capability, residualCode), visual: true };
}

function imperativeResidual(capability, residualCode) {
  return {
    capability,
    status: 'imperative-residual',
    residualCode,
    visual: true,
  };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
