import path from 'node:path';

import { parse } from '@babel/parser';

export function parseModule(source, filename) {
  if (typeof source !== 'string' || source.length === 0 || source.length > 250_000) {
    throw new TypeError('moduleSource must be bounded ESM source');
  }
  return parse(source, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: ['classProperties', 'jsx'],
    errorRecovery: false,
  });
}

export function classMethod(classNode, name) {
  return classNode?.body?.body?.find((entry) => (
    entry.type === 'ClassMethod' && propertyName(entry.key) === name
  ));
}

export function findSuperCall(method) {
  return findSuperCalls(method)[0] ?? null;
}

export function findSuperCalls(method) {
  const found = [];
  walk(method?.body, (node) => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Super') found.push(node);
  });
  return found;
}

export function variableDefinitions(root) {
  const definitions = new Map();
  const ambiguous = new Set();
  walk(root, (node) => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier' || !node.init) return;
    if (definitions.has(node.id.name)) ambiguous.add(node.id.name);
    else definitions.set(node.id.name, node.init);
  });
  for (const name of ambiguous) definitions.delete(name);
  return definitions;
}

export function expressionClosure(root, definitions) {
  const nodes = [];
  const visitedDefinitions = new Set();
  const visit = (node, parent = null, parentKey = null) => {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    if (node.type === 'Identifier' && definitions.has(node.name)
        && isReferencedIdentifier(parent, parentKey)
        && !visitedDefinitions.has(node.name)) {
      visitedDefinitions.add(node.name);
      visit(definitions.get(node.name));
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((entry) => visit(entry, node, key));
      else if (value && typeof value === 'object') visit(value, node, key);
    }
  };
  visit(root);
  return nodes;
}

function isReferencedIdentifier(parent, parentKey) {
  if (!parent) return true;
  if (parent.type === 'MemberExpression' && parentKey === 'property' && !parent.computed) return false;
  if (['ObjectProperty', 'ObjectMethod', 'ClassMethod', 'ClassProperty', 'PropertyDefinition']
    .includes(parent.type) && parentKey === 'key' && !parent.computed) return false;
  return true;
}

export function expressionDependsOn(root, identifier, definitions) {
  if (!identifier) return false;
  return expressionClosure(root, definitions).some((node) => (
    node.type === 'Identifier' && node.name === identifier
  ));
}

export function resolveImport(sourceFile, specifier) {
  return normalizeFile(path.posix.join(path.posix.dirname(sourceFile), specifier));
}

export function normalizeFile(value) {
  return typeof value === 'string' ? path.posix.normalize(value.replaceAll('\\', '/')) : value;
}

export function isAuthoredLiteral(node) {
  if (!node) return false;
  if (['BooleanLiteral', 'NumericLiteral', 'StringLiteral'].includes(node.type)) return true;
  if (node.type === 'UnaryExpression') return isAuthoredLiteral(node.argument);
  if (node.type === 'ArrayExpression') return node.elements.length > 0 && node.elements.every(isAuthoredLiteral);
  if (node.type === 'ObjectExpression') return node.properties.length > 0 && node.properties.every((property) => (
    property.type === 'ObjectProperty' && !property.computed && isAuthoredLiteral(property.value)
  ));
  return false;
}

export function unwrapFreeze(node) {
  if (node?.type === 'CallExpression'
      && node.callee?.type === 'MemberExpression'
      && node.callee.object?.type === 'Identifier'
      && node.callee.object.name === 'Object'
      && propertyName(node.callee.property) === 'freeze'
      && node.arguments.length === 1) {
    return node.arguments[0];
  }
  return node;
}

export function literalTokenArray(node) {
  const value = unwrapFreeze(node);
  if (value?.type !== 'ArrayExpression') return null;
  const values = value.elements.map(literalString);
  return values.some((entry) => entry === null) ? null : values;
}

export function literalString(node) {
  return node?.type === 'StringLiteral' ? node.value : null;
}

export function propertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'StringLiteral') return node.value;
  return null;
}

export function nodeId(node) {
  return `${node.start ?? 'x'}:${node.end ?? 'x'}`;
}

export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

export function unique(values) {
  return [...new Set(values)].sort();
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
