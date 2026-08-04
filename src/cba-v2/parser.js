import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';

const traverse = traverseModule.default ?? traverseModule;

/** Parse once and lower JSX to a private element marker for later analysis. */
export function parseCompositionSource(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new TypeError('composition source must be a non-empty string');
  }
  const normalizedSource = unwrapMarkdownFence(source);
  const ast = parse(normalizedSource, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  nameAnonymousDefaultExport(ast);
  lowerJsx(ast);
  return { ast, source: normalizedSource };
}

function unwrapMarkdownFence(source) {
  const trimmed = source.trim();
  const match = trimmed.match(/^```(?:jsx|javascript|js|tsx|typescript|ts)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/iu);
  return match ? match[1] : source;
}

function lowerJsx(ast) {
  traverse(ast, {
    JSXElement: {
      exit(path) {
        const opening = path.node.openingElement;
        const type = jsxName(opening.name);
        const props = jsxProps(opening.attributes);
        const children = jsxChildren(path.node.children);
        const replacement = t.callExpression(t.identifier('__v2Element'), [type, props, ...children]);
        t.inherits(replacement, path.node);
        path.replaceWith(replacement);
      },
    },
    JSXFragment: {
      exit(path) {
        const replacement = t.callExpression(t.identifier('__v2Element'), [
          t.identifier('__v2Fragment'),
          t.nullLiteral(),
          ...jsxChildren(path.node.children),
        ]);
        t.inherits(replacement, path.node);
        path.replaceWith(replacement);
      },
    },
  });
}

function jsxName(node) {
  if (t.isJSXIdentifier(node)) {
    return /^[a-z]/.test(node.name) ? t.stringLiteral(node.name) : t.identifier(node.name);
  }
  if (t.isJSXMemberExpression(node)) {
    return t.memberExpression(jsxName(node.object), t.identifier(node.property.name));
  }
  if (t.isJSXNamespacedName(node)) {
    return t.stringLiteral(`${node.namespace.name}:${node.name.name}`);
  }
  throw new TypeError('Unsupported JSX element name');
}

function jsxProps(attributes) {
  if (attributes.length === 0) return t.nullLiteral();
  return t.objectExpression(attributes.map((attribute) => {
    if (t.isJSXSpreadAttribute(attribute)) return t.spreadElement(attribute.argument);
    const key = t.isValidIdentifier(attribute.name.name, false)
      ? t.identifier(attribute.name.name)
      : t.stringLiteral(attribute.name.name);
    let value = t.booleanLiteral(true);
    if (t.isStringLiteral(attribute.value)) value = t.stringLiteral(attribute.value.value);
    else if (t.isJSXExpressionContainer(attribute.value)) value = attribute.value.expression;
    else if (attribute.value) value = attribute.value;
    return t.objectProperty(key, value);
  }));
}

function jsxChildren(children) {
  const output = [];
  for (const child of children) {
    if (t.isJSXText(child)) {
      const value = cleanText(child.value);
      if (value) output.push(t.stringLiteral(value));
    } else if (t.isJSXExpressionContainer(child)) {
      if (!t.isJSXEmptyExpression(child.expression)) output.push(child.expression);
    } else if (t.isJSXSpreadChild(child)) output.push(t.spreadElement(child.expression));
    else output.push(child);
  }
  return output;
}

function cleanText(raw) {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let value = '';
  lines.forEach((line, index) => {
    const normalized = line.replace(/\t/g, ' ');
    const trimmed = index === 0 ? normalized.replace(/\s+$/g, '') : normalized.trim();
    if (!trimmed) return;
    if (value && !value.endsWith(' ')) value += ' ';
    value += trimmed;
  });
  return value;
}

function nameAnonymousDefaultExport(ast) {
  for (const statement of [...ast.program.body]) {
    if (!t.isExportDefaultDeclaration(statement)) continue;
    const declaration = statement.declaration;
    if (t.isFunctionDeclaration(declaration) && !declaration.id) {
      declaration.id = t.identifier('GeneratedComposition');
      return;
    }
    if (t.isArrowFunctionExpression(declaration) || t.isFunctionExpression(declaration)) {
      const index = ast.program.body.indexOf(statement);
      ast.program.body.splice(index, 0, t.variableDeclaration('const', [
        t.variableDeclarator(t.identifier('GeneratedComposition'), declaration),
      ]));
      statement.declaration = t.identifier('GeneratedComposition');
      return;
    }
  }
}
