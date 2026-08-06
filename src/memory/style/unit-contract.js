import path from 'node:path';

import {
  classMethod,
  expressionDependsOn,
  findSuperCalls,
  nodeId,
  normalizeFile,
  propertyName,
  variableDefinitions,
  walk,
} from './ast.js';
import {
  buildUnitStyleEvidence,
  meaningfulStyleDecision,
  vectorPathStyleDecision,
} from './evidence.js';
import { emptyFacts } from './report.js';

const FOUNDATION_BEHAVIOUR_MODULE = /behaviours\/(?:blur|opacity|rotate|scale|text-reveal|translate|visible-during)\.js$/u;
const VECTOR_PATH_MODULE = 'units/vector-path.js';
const FORBIDDEN_LOCAL_PIVOT_KEYS = new Set(['pivot', 'transformOrigin']);
const STYLE_BOUNDARY_ARGUMENTS = Object.freeze({
  'box.js': [1],
  'canvas.js': [0],
  'image.js': [1],
  'layer.js': [1],
  'solid-fill.js': [0],
  'sprite.js': [1],
  'surface.js': [0],
  'svg.js': [1],
  'text.js': [1],
  'video.js': [1],
  'vignette.js': [0],
  'vector-path.js': [1],
});

const STYLE_KEYS = Object.freeze({
  composition: /^(?:alignContent|alignItems|alignSelf|bottom|display|flex|flexBasis|flexDirection|flexGrow|flexWrap|gap|grid|gridArea|gridColumn|gridRow|height|inset|justifyContent|left|margin|marginBottom|marginLeft|marginRight|marginTop|maxHeight|maxWidth|minHeight|minWidth|overflow|padding|paddingBottom|paddingLeft|paddingRight|paddingTop|position|right|top|width|zIndex)$/u,
  typography: /^(?:fontFamily|fontFeatureSettings|fontSize|fontStretch|fontStyle|fontVariant|fontWeight|letterSpacing|lineHeight|textAlign|textDecoration|textTransform|wordSpacing)$/u,
  palette: /^(?:background|backgroundColor|borderColor|color|fill|outlineColor|stroke)$/u,
  rendering: /^(?:backdropFilter|backgroundImage|border|borderRadius|boxShadow|clipPath|filter|mask|nonScalingStroke|outline|roundCaps|roundJoins|strokeDasharray|strokeWidth|textShadow)$/u,
});
const STYLE_AXIS_MINIMUMS = Object.freeze({
  composition: 4,
  typography: 3,
  palette: 2,
  rendering: 2,
  motion: 1,
});

export function inspectUnit(classNode, imports, violations, dependencyContext) {
  const constructor = classMethod(classNode, 'constructor');
  if (!constructor) return emptyFacts();
  const slotName = constructor.params[0]?.type === 'Identifier' ? constructor.params[0].name : null;
  const definitions = variableDefinitions(constructor.body);
  const unitNodes = new Map();
  const behaviourNodes = new Map();
  walk(constructor.body, (node) => {
    if (node.type !== 'NewExpression' || node.callee?.type !== 'Identifier') return;
    if (imports.get(node.callee.name)?.type === 'unit') unitNodes.set(nodeId(node), node);
    if (imports.get(node.callee.name)?.type === 'behaviour') behaviourNodes.set(nodeId(node), node);
  });

  const superCalls = findSuperCalls(constructor);
  if (superCalls.length !== 1) violations.push('unit-single-super-required');
  if (containsConditionalConstruction(constructor.body)) {
    violations.push('unit-tree-must-be-unconditional');
  }
  const superCall = superCalls[0];
  if (superCall?.arguments?.length !== 1) violations.push('unit-tree-root-required');
  const root = unitReference(superCall?.arguments?.[0], definitions, imports, slotName);
  if (!root || root.external) violations.push('unit-tree-root-required');

  const graph = new Map([...unitNodes.keys()].map((id) => [id, []]));
  for (const [id, unit] of unitNodes) {
    const children = [];
    for (const argument of unit.arguments ?? []) {
      collectUnitReferences(argument, definitions, imports, slotName, children);
    }
    graph.set(id, children);
  }

  const traversal = {
    branch: false,
    cycle: false,
    parentCounts: new Map(),
    slotReferences: 0,
  };
  const seen = new Set();
  const treeDepth = root && !root.external
    ? visitTree(root, graph, seen, new Set(), traversal)
    : 0;
  if (traversal.slotReferences === 0) violations.push('semantic-slot-not-in-tree');
  if (traversal.slotReferences > 1) violations.push('semantic-slot-multiple');
  if (seen.size < 5) violations.push('unit-tree-too-small');
  if (treeDepth < 4) violations.push('unit-tree-too-shallow');
  if (!traversal.branch) violations.push('unit-tree-branch-required');
  if (traversal.cycle) violations.push('unit-tree-cycle');
  if ([...unitNodes.keys()].some((id) => !seen.has(id))) violations.push('orphan-unit-node');
  if ([...traversal.parentCounts.values()].some((count) => count > 1)) {
    violations.push('unit-tree-multiple-parent');
  }

  const styleAnalysis = styleAxisDecisions(
    [...seen].map((id) => unitNodes.get(id)).filter(Boolean),
    definitions,
    imports,
    slotName,
    violations,
  );
  const axisDecisions = styleAnalysis.axes;
  const attachments = inspectBehaviourAttachments({
    behaviourNodes,
    constructor,
    definitions,
    imports,
    reachableUnits: seen,
    slotName,
    unitNodes,
    violations,
    ...dependencyContext,
  });
  if (attachments.valid > 0) axisDecisions.motion.add('authored-behaviour');
  const missingAxes = Object.entries(axisDecisions)
    .filter(([, values]) => values.size === 0)
    .map(([axis]) => axis);
  for (const axis of missingAxes) violations.push(`style-axis-${axis}-missing`);
  for (const [axis, minimum] of Object.entries(STYLE_AXIS_MINIMUMS)) {
    if (axisDecisions[axis].size < minimum) {
      violations.push(`style-axis-${axis}-under-authored`);
    }
  }
  const authoredVisualDecisions = Object.values(axisDecisions)
    .reduce((sum, decisions) => sum + decisions.size, 0);
  if (authoredVisualDecisions < 8) violations.push('insufficient-authored-style-decisions');

  const evidence = buildUnitStyleEvidence({
    decisions: styleAnalysis.decisions,
    internalUnitNodes: seen.size,
    treeDepth,
    branched: traversal.branch,
    treeSignature: semanticTreeSignature(root, graph, unitNodes, imports),
    motionDescriptors: attachments.motionDescriptors,
    motionFingerprints: attachments.motionFingerprints,
  });
  return {
    internalUnitNodes: seen.size,
    treeDepth,
    authoredVisualDecisions,
    styleAxes: Object.fromEntries(Object.entries(axisDecisions)
      .map(([axis, values]) => [axis, values.size])),
    behaviourAttachments: attachments.valid,
    frameDriven: false,
    writtenChannel: null,
    evidence,
  };
}

function inspectBehaviourAttachments({
  behaviourNodes,
  constructor,
  definitions,
  imports,
  reachableUnits,
  slotName,
  unitNodes,
  violations,
  dependencies,
  dependencyStack,
  inspectDependency,
}) {
  const attached = new Set();
  let valid = 0;
  const motionDescriptors = new Set();
  const motionFingerprints = new Set();
  walk(constructor.body, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression'
        || node.callee.computed || propertyName(node.callee.property) !== 'add') return;
    const owner = unitReference(node.callee.object, definitions, imports, slotName);
    for (const argument of node.arguments ?? []) {
      if (argument?.type !== 'NewExpression' || argument.callee?.type !== 'Identifier'
          || imports.get(argument.callee.name)?.type !== 'behaviour') continue;
      attached.add(nodeId(argument));
      const owned = unitReference(argument.arguments?.[0], definitions, imports, slotName);
      if (!owner || owner.external || !owned || owned.external || owner.id !== owned.id
          || argument.arguments.length !== 1 || !reachableUnits.has(owner.id)) {
        violations.push('unattached-behaviour');
        continue;
      }
      const binding = imports.get(argument.callee.name);
      if (FOUNDATION_BEHAVIOUR_MODULE.test(binding.resolved)) {
        violations.push('foundation-motion-is-not-style-law');
        continue;
      }
      const nested = validateAttachedBehaviour({
        binding,
        dependencies,
        dependencyStack,
        inspectDependency,
        violations,
      });
      if (nested) {
        if (nested.facts?.writtenChannel?.startsWith('transform:')
            && !isCompositionPivotOwner(owner, unitNodes, imports)) {
          violations.push('transform-behaviour-requires-composition-pivot');
          continue;
        }
        valid += 1;
        nested.evidence?.descriptors?.motion?.forEach((value) => motionDescriptors.add(value));
        if (nested.evidence?.fingerprintSha256) {
          motionFingerprints.add(nested.evidence.fingerprintSha256);
        }
      }
    }
  });
  if ([...behaviourNodes.keys()].some((id) => !attached.has(id))) {
    violations.push('unattached-behaviour');
  }
  return {
    valid,
    motionDescriptors: [...motionDescriptors].sort(),
    motionFingerprints: [...motionFingerprints].sort(),
  };
}

function isCompositionPivotOwner(owner, unitNodes, imports) {
  if (!owner || owner.external) return false;
  const node = unitNodes.get(owner.id);
  if (node?.type !== 'NewExpression' || node.callee?.type !== 'Identifier') return false;
  const binding = imports.get(node.callee.name);
  return binding?.imported === 'CompositionPivot'
    && binding.resolved === 'units/composition-pivot.js';
}

function validateAttachedBehaviour({
  binding,
  dependencies,
  dependencyStack,
  inspectDependency,
  violations,
}) {
  if (!dependencies.supplied) {
    violations.push('attached-behaviour-source-missing');
    return null;
  }
  const dependency = dependencies.find(binding);
  if (!dependency) {
    violations.push('attached-behaviour-source-missing');
    return null;
  }
  const sourceFile = normalizeFile(dependency.sourceFile ?? binding.resolved);
  if (dependencyStack.has(sourceFile)) {
    violations.push('style-dependency-cycle');
    return null;
  }
  const nested = inspectDependency({
    moduleSource: dependency.moduleSource,
    sourceFile,
    type: 'behaviour',
    exportName: binding.imported,
    dependencyModules: dependencies.original,
    _dependencyStack: [...dependencyStack],
  });
  if (!nested.ok) {
    violations.push('attached-behaviour-contract-failed');
    return null;
  }
  return nested;
}

function styleAxisDecisions(nodes, definitions, imports, slotName, violations) {
  const axes = {
    composition: new Set(),
    typography: new Set(),
    palette: new Set(),
    rendering: new Set(),
    motion: new Set(),
  };
  const decisions = [];
  for (const [unitIndex, node] of nodes.entries()) {
    const binding = node.callee?.type === 'Identifier' ? imports.get(node.callee.name) : null;
    if (binding?.resolved === VECTOR_PATH_MODULE) {
      const vectorDecision = vectorPathStyleDecision(node.arguments?.[0]);
      if (vectorDecision === null) {
        violations.push('vector-path-grammar-invalid');
      } else {
        axes.rendering.add(`${unitIndex}:vectorPath`);
        decisions.push({ ...vectorDecision, unitIndex });
      }
    }
    const boundaryIndexes = styleBoundaryIndexes(binding?.resolved);
    for (const [index, argument] of (node.arguments ?? []).entries()) {
      if (argument?.type !== 'ObjectExpression') continue;
      if (binding?.resolved.endsWith('units/group.js')) {
        violations.push('invalid-foundation-config-argument');
        continue;
      }
      if (!boundaryIndexes.has(index)) continue;
      const seenKeys = new Set();
      for (const property of argument.properties) {
        if (property.type !== 'ObjectProperty' || property.computed) {
          violations.push('style-boundary-must-be-literal');
          continue;
        }
        const key = propertyName(property.key);
        if (!key) continue;
        if (seenKeys.has(key)) {
          violations.push('style-boundary-duplicate-key');
          continue;
        }
        seenKeys.add(key);
        if (expressionDependsOn(property.value, slotName, definitions)) {
          violations.push('semantic-slot-controls-style');
        }
        if (FORBIDDEN_LOCAL_PIVOT_KEYS.has(key)) {
          violations.push('composition-pivot-must-be-absolute');
        }
        for (const [axis, pattern] of Object.entries(STYLE_KEYS)) {
          if (!pattern.test(key)) continue;
          const decision = meaningfulStyleDecision(axis, key, property.value);
          if (decision) {
            axes[axis].add(`${unitIndex}:${key}`);
            decisions.push({ ...decision, unitIndex });
          } else {
            violations.push('style-decision-no-op');
          }
        }
        if (containsNestedStyleProperty(property.value)) violations.push('nested-style-metadata');
      }
    }
  }
  return { axes, decisions };
}

function semanticTreeSignature(reference, graph, unitNodes, imports, active = new Set()) {
  if (!reference) return null;
  if (reference.external) return '$semantic-slot';
  if (active.has(reference.id)) return '$cycle';
  const node = unitNodes.get(reference.id);
  if (!node) return '$missing-unit';
  const binding = node.callee?.type === 'Identifier' ? imports.get(node.callee.name) : null;
  const next = new Set(active);
  next.add(reference.id);
  return {
    unit: binding?.resolved ?? node.callee?.name ?? '$unknown-unit',
    children: (graph.get(reference.id) ?? [])
      .map((child) => semanticTreeSignature(child, graph, unitNodes, imports, next)),
  };
}

function containsNestedStyleProperty(value) {
  let found = false;
  walk(value, (node) => {
    if (node === value || node.type !== 'ObjectProperty' || node.computed) return;
    const key = propertyName(node.key);
    if (key && Object.values(STYLE_KEYS).some((pattern) => pattern.test(key))) found = true;
  });
  return found;
}

function unitReference(node, definitions, imports, slotName) {
  if (node?.type === 'NewExpression' && isImportedKind(node, imports, 'unit')) {
    return { id: nodeId(node), external: false };
  }
  if (node?.type === 'Identifier') {
    const value = definitions.get(node.name);
    if (value && isImportedKind(value, imports, 'unit')) return { id: nodeId(value), external: false };
    if (node.name === slotName) return { id: `slot:${slotName}`, external: true };
  }
  return null;
}

function collectUnitReferences(node, definitions, imports, slotName, output) {
  const direct = unitReference(node, definitions, imports, slotName);
  if (direct) {
    output.push(direct);
    return;
  }
  if (node?.type === 'ArrayExpression') {
    node.elements.forEach((entry) => collectUnitReferences(entry, definitions, imports, slotName, output));
  }
}

function visitTree(reference, graph, seen, active, traversal) {
  if (reference.external) {
    traversal.slotReferences += 1;
    return 1;
  }
  if (active.has(reference.id)) {
    traversal.cycle = true;
    return 0;
  }
  if (seen.has(reference.id)) return 1;
  seen.add(reference.id);
  active.add(reference.id);
  const children = graph.get(reference.id) ?? [];
  if (children.length >= 2) traversal.branch = true;
  for (const child of children) {
    traversal.parentCounts.set(child.id, (traversal.parentCounts.get(child.id) ?? 0) + 1);
  }
  const depth = 1 + (children.length === 0
    ? 0
    : Math.max(...children.map((child) => visitTree(child, graph, seen, active, traversal))));
  active.delete(reference.id);
  return depth;
}

function styleBoundaryIndexes(resolved) {
  if (typeof resolved !== 'string' || !resolved.startsWith('units/')) return new Set();
  return new Set(STYLE_BOUNDARY_ARGUMENTS[path.posix.basename(resolved)] ?? []);
}

function containsConditionalConstruction(root) {
  let found = false;
  walk(root, (node) => {
    if (['ConditionalExpression', 'DoWhileStatement', 'ForInStatement', 'ForOfStatement',
      'ForStatement', 'IfStatement', 'SwitchStatement', 'TryStatement', 'WhileStatement']
      .includes(node.type)) found = true;
  });
  return found;
}

function isImportedKind(node, imports, type) {
  return node?.callee?.type === 'Identifier' && imports.get(node.callee.name)?.type === type;
}
