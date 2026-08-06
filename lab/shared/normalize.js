import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

import { sha256 } from '../../src/lib.js';

const traverse = traverseModule.default ?? traverseModule;

const OMITTED_AST_KEYS = new Set([
  'start',
  'end',
  'loc',
  'extra',
  'leadingComments',
  'innerComments',
  'trailingComments',
  'comments',
  'errors',
  'tokens',
]);

export const KNOWN_GLOBALS = new Set([
  'GeneratedComposition',
  'React',
  'useEffect',
  'useState',
  'useMemo',
  'useRef',
  'useCallback',
  'AbsoluteFill',
  'useCurrentFrame',
  'useVideoConfig',
  'interpolate',
  'spring',
  'Sequence',
  'Series',
  'Easing',
  'Video',
  'OffthreadVideo',
  'Audio',
  'Img',
  'AnimatedImage',
  'ThreeCanvas',
  'THREE',
  'loadGoogleFont',
  'GOOGLE_FONTS',
  'Text',
  'Text3D',
  'Center',
  'Sparkles',
  'Float',
  'Stars',
  'Cloud',
  'Sky',
  'Environment',
  'ContactShadows',
  'OrbitControls',
  'PerspectiveCamera',
  'OrthographicCamera',
  'Billboard',
  'Backdrop',
  'RoundedBox',
  'Box',
  'Sphere',
  'Plane',
  'Torus',
  'TorusKnot',
  'Cylinder',
  'Cone',
  'Ring',
  'Circle',
  'GradientTexture',
  'MeshDistortMaterial',
  'MeshWobbleMaterial',
  'MeshTransmissionMaterial',
  'MeshReflectorMaterial',
  'DreiImage',
  'Line',
  'RoundedBoxGeometry',
  'Math',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Map',
  'Set',
  'JSON',
]);

export function stripRuntimeWrappers(code) {
  return code
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*```[a-z]*\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .replace(
      /^\s*const\s*\{[^}]*\}\s*=\s*(?:React|Remotion|RemotionThree|Drei|THREE|this|globalThis|window)\s*;?\s*(?:\/\/.*)?$/gm,
      '',
    )
    .trim();
}

export function normalizeExactSource(code) {
  return String(code ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*```[a-z]*\s*\n/i, '')
    .replace(/\n```\s*$/i, '')
    .trim();
}

export function parseComposition(code) {
  const stripped = stripRuntimeWrappers(code);
  const ast = parse(stripped, {
    sourceType: 'unambiguous',
    allowAwaitOutsideFunction: false,
    errorRecovery: false,
    plugins: ['jsx', 'typescript'],
  });
  normalizeModuleWrappers(ast.program);
  return { ast, stripped };
}

export function walkAst(root, visitor) {
  const visit = (value, parent = null, key = null) => {
    if (Array.isArray(value)) {
      for (const nested of value) visit(nested, parent, key);
      return;
    }
    if (!value || typeof value !== 'object') return;

    if (typeof value.type === 'string') visitor(value, parent, key);

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      if (OMITTED_AST_KEYS.has(nestedKey)) continue;
      if (nestedValue && typeof nestedValue === 'object') {
        visit(nestedValue, value, nestedKey);
      }
    }
  };

  visit(root);
}

export function canonicalAstHash(node) {
  return sha256(JSON.stringify(canonicalize(node)));
}

export function canonicalize(node) {
  return canonicalizeNode(node, null, null, buildBindingLabels(node));
}

function canonicalizeNode(node, parent = null, parentKey = null, bindingLabels) {
  if (Array.isArray(node)) {
    return node.map((nested) => canonicalizeNode(nested, parent, parentKey, bindingLabels));
  }
  if (!node || typeof node !== 'object') return node;

  if (
    node.type === 'ArrayExpression'
    && parent?.type === 'VariableDeclarator'
    && parentKey === 'init'
  ) {
    const dataShape = homogeneousDataArrayShape(node.elements);
    if (dataShape) {
      return { type: 'DataArray', elementShape: dataShape };
    }
  }
  if (node.type === 'ArrayExpression') {
    const numericValues = node.elements.map((element) => (
      element?.type === 'NumericLiteral' ? element.value : null
    ));
    if (numericValues.length > 0 && numericValues.every((value) => value !== null)) {
      return {
        type: 'NumericArray',
        length: numericValues.length,
        direction: numericDirection(numericValues),
      };
    }
  }

  if (node.type === 'Identifier') {
    const isPropertyKey = ['ObjectProperty', 'ObjectMethod', 'ClassMethod', 'ClassProperty'].includes(parent?.type)
      && parentKey === 'key'
      && !parent.computed;
    const isMemberProperty = ['MemberExpression', 'OptionalMemberExpression'].includes(parent?.type)
      && parentKey === 'property'
      && !parent.computed;
    const bindingLabel = bindingLabels.get(node);
    return {
      type: 'Identifier',
      name: isPropertyKey || isMemberProperty
        ? node.name
        : bindingLabel ?? (KNOWN_GLOBALS.has(node.name) ? node.name : '_free'),
    };
  }
  if (node.type === 'JSXIdentifier') {
    const isAttribute = parent?.type === 'JSXAttribute' && parentKey === 'name';
    const isMemberProperty = parent?.type === 'JSXMemberExpression' && parentKey === 'property';
    const isIntrinsic = /^[a-z]/.test(node.name);
    const bindingLabel = bindingLabels.get(node);
    return {
      type: 'JSXIdentifier',
      name: isAttribute || isMemberProperty || isIntrinsic
        ? node.name
        : bindingLabel ?? (KNOWN_GLOBALS.has(node.name) ? node.name : '_freeComponent'),
    };
  }
  if (node.type === 'StringLiteral' || node.type === 'DirectiveLiteral') {
    return { type: node.type, value: classifyString(node.value) };
  }
  if (node.type === 'JSXText') {
    return { type: node.type, value: node.value.trim() ? '_text' : '' };
  }
  if (node.type === 'NumericLiteral') {
    return {
      type: node.type,
      value: [-1, 0, 1].includes(node.value) ? node.value : '_number',
    };
  }
  if (node.type === 'BigIntLiteral') {
    return { type: node.type, value: '_bigint' };
  }
  if (node.type === 'RegExpLiteral') {
    return { type: node.type, pattern: '_regexp', flags: node.flags };
  }
  if (node.type === 'TemplateElement') {
    return {
      type: node.type,
      value: { raw: classifyTemplateText(node.value?.raw ?? '') },
      tail: node.tail,
    };
  }

  const canonical = {};
  for (const [key, value] of Object.entries(node)) {
    if (OMITTED_AST_KEYS.has(key)) continue;
    canonical[key] = canonicalizeNode(value, node, key, bindingLabels);
  }
  return canonical;
}

function buildBindingLabels(node) {
  const labels = new WeakMap();
  const bindingNames = new Map();
  const freeNames = new Map();
  let nextBinding = 0;
  let nextFree = 0;

  const file = wrapForTraversal(node);
  traverse(file, {
    Identifier(path) {
      const binding = path.scope.getBinding(path.node.name);
      if (binding) {
        if (!bindingNames.has(binding)) bindingNames.set(binding, `_b${nextBinding++}`);
        labels.set(path.node, bindingNames.get(binding));
        return;
      }
      if (KNOWN_GLOBALS.has(path.node.name)) return;
      if (!freeNames.has(path.node.name)) freeNames.set(path.node.name, `_f${nextFree++}`);
      labels.set(path.node, freeNames.get(path.node.name));
    },
    JSXIdentifier(path) {
      if (/^[a-z]/.test(path.node.name)) return;
      const binding = path.scope.getBinding(path.node.name);
      if (binding) {
        if (!bindingNames.has(binding)) bindingNames.set(binding, `_b${nextBinding++}`);
        labels.set(path.node, bindingNames.get(binding));
        return;
      }
      if (KNOWN_GLOBALS.has(path.node.name)) return;
      if (!freeNames.has(path.node.name)) freeNames.set(path.node.name, `_f${nextFree++}`);
      labels.set(path.node, freeNames.get(path.node.name));
    },
  });
  return labels;
}

function normalizeModuleWrappers(program) {
  program.body = program.body.flatMap((statement) => {
    if (statement.type === 'ImportDeclaration' || statement.type === 'ExportAllDeclaration') return [];
    if (statement.type === 'ExportNamedDeclaration') {
      return statement.declaration ? [statement.declaration] : [];
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      return /Declaration$/.test(statement.declaration?.type ?? '')
        ? [statement.declaration]
        : [];
    }
    return [statement];
  });
  program.sourceType = 'script';
}

function wrapForTraversal(node) {
  if (node?.type === 'File') return node;
  if (node?.type === 'Program') {
    return { type: 'File', program: node };
  }
  const body = /(?:Statement|Declaration)$/.test(node?.type ?? '')
    ? [node]
    : [{ type: 'ExpressionStatement', expression: node }];
  return {
    type: 'File',
    program: {
      type: 'Program',
      sourceType: 'script',
      interpreter: null,
      directives: [],
      body,
    },
  };
}

function homogeneousDataArrayShape(elements) {
  if (elements.length < 2) return null;

  if (elements.every((element) => isNonNumericDataLiteral(element))) {
    return `literal:${elements[0].type}`;
  }

  if (!elements.every((element) => element?.type === 'ObjectExpression')) return null;
  const shapes = elements.map((element) => element.properties.map((property) => {
    if (property.type !== 'ObjectProperty' || property.computed) return null;
    const key = propertyName(property.key);
    if (!key || !isDataLiteral(property.value)) return null;
    return `${key}:${property.value.type}`;
  }));
  if (shapes.some((shape) => shape.some((part) => part === null))) return null;
  const first = shapes[0].join('|');
  return shapes.every((shape) => shape.join('|') === first) ? `records:${first}` : null;
}

function isNonNumericDataLiteral(node) {
  return ['StringLiteral', 'BooleanLiteral', 'NullLiteral'].includes(node?.type);
}

function isDataLiteral(node) {
  return [
    'StringLiteral',
    'NumericLiteral',
    'BooleanLiteral',
    'NullLiteral',
  ].includes(node?.type);
}

export function numericDirection(values) {
  if (values.length < 2 || values.every((value) => value === values[0])) return 'constant';
  let increasing = true;
  let decreasing = true;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1]) increasing = false;
    if (values[index] >= values[index - 1]) decreasing = false;
  }
  if (increasing) return 'increasing';
  if (decreasing) return 'decreasing';
  const maximumIndex = values.indexOf(Math.max(...values));
  const minimumIndex = values.indexOf(Math.min(...values));
  if (maximumIndex > 0 && maximumIndex < values.length - 1) return 'peak';
  if (minimumIndex > 0 && minimumIndex < values.length - 1) return 'valley';
  return 'mixed';
}

export function classifyString(value) {
  if (/^https?:\/\//i.test(value)) {
    return `_url:${mediaKind(value)}`;
  }
  if (/^#[a-f0-9]{3,8}$/i.test(value) || /^(?:rgb|hsl)a?\(/i.test(value)) {
    return '_color';
  }
  if (/^(?:transparent|white|black|red|blue|green|yellow|gray|grey)$/i.test(value)) {
    return '_color-name';
  }
  if (/^(?:px|%|deg|rad|s|ms|em|rem|vh|vw)$/i.test(value)) {
    return '_unit';
  }
  if (value.length === 0) return '';
  if (value.length <= 3) return '_short-text';
  return '_text';
}

function classifyTemplateText(value) {
  return value
    .replace(/https?:\/\/[^\s'"`)]+/gi, '_url')
    .replace(/#[a-f0-9]{3,8}\b/gi, '_color')
    .replace(/-?\d+(?:\.\d+)?/g, '_number')
    .replace(/[A-Za-z][A-Za-z\s_-]{3,}/g, '_text')
    .replace(/\s+/g, ' ')
    .trim();
}

export function calleeName(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
    const objectName = calleeName(callee.object);
    const propertyName = callee.computed
      ? null
      : calleeName(callee.property);
    return objectName && propertyName ? `${objectName}.${propertyName}` : propertyName ?? objectName;
  }
  if (callee.type === 'ThisExpression') return 'this';
  return null;
}

export function jsxName(name) {
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    const objectName = jsxName(name.object);
    const propertyName = jsxName(name.property);
    return objectName && propertyName ? `${objectName}.${propertyName}` : null;
  }
  return null;
}

export function propertyName(property) {
  if (!property) return null;
  if (property.type === 'Identifier' || property.type === 'JSXIdentifier') return property.name;
  if (property.type === 'StringLiteral' || property.type === 'NumericLiteral') {
    return String(property.value);
  }
  return null;
}

export function mediaKind(value) {
  const path = value.split(/[?#]/, 1)[0].toLowerCase();
  if (/\.(?:png|jpe?g|webp|gif|avif|apng)$/.test(path)) return 'image';
  if (/\.(?:mp4|webm|mov|m4v)$/.test(path)) return 'video';
  if (/\.(?:mp3|wav|m4a|aac|ogg)$/.test(path)) return 'audio';
  if (/\.(?:woff2?|ttf|otf)$/.test(path)) return 'font';
  return 'other';
}
