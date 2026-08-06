import {
  classMethod,
  expressionClosure,
  findSuperCall,
  literalString,
  propertyName,
  variableDefinitions,
  walk,
} from './ast.js';
import { buildBehaviourStyleEvidence } from './evidence.js';
import { emptyFacts } from './report.js';

const SAFE_VISUAL_CHANNEL = /^[a-z][a-z0-9-]*$/u;
const GENERIC_CHANNEL = /^(?:appearance|channel|css|path|property|props|style|value)$/u;
const DIRECT_VISUAL_SINKS = new Set(['opacity', 'text', 'visible']);
const FORBIDDEN_DIRECT_SINKS = new Set(['filter', 'scale', 'timer', 'transform']);
const CANONICAL_BEHAVIOUR_HELPERS = /behaviours\/shared\.js$/u;

export function inspectBehaviour(classNode, imports, violations) {
  const constructor = classMethod(classNode, 'constructor');
  const constructorSuper = constructor && findSuperCall(constructor);
  if (constructorSuper?.arguments?.length !== 1
      || constructorSuper.arguments[0]?.type !== 'Identifier'
      || constructorSuper.arguments[0].name !== constructor.params[0]?.name) {
    violations.push('behaviour-owner-binding');
  }
  const onFrame = classMethod(classNode, 'onFrame');
  if (!onFrame || onFrame.params.length !== 1 || onFrame.params[0]?.type !== 'Identifier') {
    violations.push('behaviour-frame-law-required');
    return emptyFacts();
  }
  const contextName = onFrame.params[0].name;
  const definitions = variableDefinitions(onFrame.body);
  const sinks = [];
  let unsupportedSink = false;
  walk(onFrame.body, (node) => {
    if (node.type === 'AssignmentExpression' && memberRootedAtUnit(node.left)) {
      const channel = directUnitMember(node.left);
      if (node.operator === '=' && DIRECT_VISUAL_SINKS.has(channel)) {
        sinks.push({ channel, rhs: node.right });
      } else {
        unsupportedSink = true;
        if (FORBIDDEN_DIRECT_SINKS.has(channel)) violations.push('direct-unit-channel-forbidden');
      }
    }
    if (node.type === 'UpdateExpression' && memberRootedAtUnit(node.argument)) {
      unsupportedSink = true;
    }
    if ((node.type === 'AssignmentExpression' || node.type === 'UpdateExpression')
        && isThisTimer(node.type === 'AssignmentExpression' ? node.left : node.argument)) {
      unsupportedSink = true;
      violations.push('direct-unit-channel-forbidden');
    }
    if (node.type !== 'CallExpression') return;
    const canonical = canonicalSink(node, imports);
    if (canonical) {
      sinks.push(canonical);
      return;
    }
    if (memberRootedAtUnit(node.callee)
        || node.arguments.some((argument) => isThisUnit(argument))) unsupportedSink = true;
  });
  if (unsupportedSink) violations.push('unsupported-visual-sink');
  if (sinks.length !== 1) {
    violations.push('behaviour-single-visual-sink-required');
    violations.push('behaviour-single-channel-required');
  }
  const sink = sinks.length === 1 ? sinks[0] : null;
  const closure = sink ? expressionClosure(sink.rhs, definitions) : [];
  const frameDriven = closure.some((node) => isFrameRead(node, contextName));
  const nonlinear = closure.some(isAuthoredNonlinearNode);
  const complexity = temporalLawComplexity(closure);
  const authored = Boolean(sink && frameDriven && nonlinear
    && complexity.operations + complexity.branches >= 4
    && complexity.constants.size >= 3);
  if (!frameDriven) violations.push('behaviour-not-frame-driven');
  if (!authored) {
    violations.push('authored-temporal-law-required');
  }
  const evidence = authored
    ? buildBehaviourStyleEvidence({ channel: sink.channel, closure })
    : null;

  return {
    internalUnitNodes: 0,
    treeDepth: 0,
    authoredVisualDecisions: 0,
    styleAxes: { composition: 0, typography: 0, palette: 0, rendering: 0, motion: authored ? 1 : 0 },
    behaviourAttachments: 0,
    frameDriven,
    writtenChannel: sink?.channel ?? null,
    evidence,
  };
}

function canonicalSink(node, imports) {
  if (node.callee?.type !== 'Identifier') return null;
  const binding = imports.get(node.callee.name);
  if (!binding || !CANONICAL_BEHAVIOUR_HELPERS.test(binding.resolved)
      || !['writeFilter', 'writeTransform'].includes(binding.imported)) return null;
  if (node.arguments.length !== 3 || !isThisUnit(node.arguments[0])) return null;
  const name = literalString(node.arguments[1]);
  if (!name || !SAFE_VISUAL_CHANNEL.test(name) || GENERIC_CHANNEL.test(name)) return null;
  return {
    channel: `${binding.imported === 'writeTransform' ? 'transform' : 'filter'}:${name}`,
    rhs: node.arguments[2],
  };
}

function isFrameRead(node, contextName) {
  return node.type === 'MemberExpression'
    && !node.computed
    && node.object?.type === 'Identifier'
    && node.object.name === contextName
    && ['dt', 'frame', 'time'].includes(propertyName(node.property));
}

function isAuthoredNonlinearNode(node) {
  if (node.type === 'ConditionalExpression') return true;
  if (node.type === 'BinaryExpression' && ['%', '**'].includes(node.operator)) return true;
  if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression'
      || node.callee.object?.type !== 'Identifier' || node.callee.object.name !== 'Math') return false;
  return /^(?:atan2|cos|exp|log|pow|sin|sqrt|tan)$/u.test(propertyName(node.callee.property) ?? '');
}

function temporalLawComplexity(nodes) {
  let operations = 0;
  let branches = 0;
  const constants = new Set();
  for (const node of nodes) {
    if (['BinaryExpression', 'LogicalExpression', 'UnaryExpression', 'UpdateExpression'].includes(node.type)) {
      operations += 1;
    }
    if (['ConditionalExpression', 'IfStatement', 'SwitchStatement'].includes(node.type)) branches += 1;
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
        && node.callee.object?.type === 'Identifier' && node.callee.object.name === 'Math') {
      operations += 1;
    }
    if (node.type === 'NumericLiteral') constants.add(node.value);
  }
  return { operations, branches, constants };
}

function memberRootedAtUnit(node) {
  let current = node;
  while (current?.type === 'MemberExpression') {
    if (isThisUnit(current)) return true;
    current = current.object;
  }
  return false;
}

function directUnitMember(node) {
  return node?.type === 'MemberExpression' && isThisUnit(node.object)
    ? propertyName(node.property) : null;
}

function isThisUnit(node) {
  return node?.type === 'MemberExpression'
    && !node.computed
    && node.object?.type === 'ThisExpression'
    && propertyName(node.property) === 'unit';
}

function isThisTimer(node) {
  return node?.type === 'MemberExpression'
    && !node.computed
    && node.object?.type === 'ThisExpression'
    && propertyName(node.property) === 'timer';
}
