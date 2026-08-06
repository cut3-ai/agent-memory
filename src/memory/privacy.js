import { parse } from '@babel/parser';
import {
  BARE_DOMAIN,
  IPV4_ADDRESS,
  IPV6_ADDRESS,
  LOCALHOST,
  RAW_EMAIL,
  RAW_URL,
  SECRET,
} from './privacy/patterns.js';
import { isPublicFontFamily } from './privacy/font-family-catalog.js';

export { assertPublicArtifact, inspectPublicArtifact } from './privacy/artifact.js';

const SOURCE_FILE = /^(?:core|units|behaviours)\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|mjs|jsx)$/u;
const TECHNICAL_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DANGEROUS_URI = /\b(?:blob|data|file|ftp|javascript|ws|wss):/iu;
const CODE_MEMBER_REFERENCE = /\b[A-Z][$\w]*\.[a-z][$\w]*(?:\(|\s)/u;
const SAFE_CODE_DOTTED = /^(?:behaviour|unit)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const STYLE_LITERAL_KEYS = new Set([
  'alignContent', 'alignItems', 'alignSelf', 'backdropFilter', 'background',
  'backgroundColor', 'backgroundImage', 'border', 'borderColor', 'borderRadius',
  'bottom', 'boxShadow', 'clipPath', 'color', 'display', 'fill', 'filter',
  'flexBasis', 'flexDirection', 'flexGrow', 'flexWrap', 'fontFamily',
  'fontFeatureSettings', 'fontSize', 'fontStretch', 'fontStyle', 'fontVariant',
  'fontWeight', 'gap', 'grid', 'gridArea', 'gridColumn', 'gridRow', 'height',
  'inset', 'justifyContent', 'left', 'letterSpacing', 'lineHeight', 'margin',
  'marginBottom', 'marginLeft', 'marginRight', 'marginTop', 'mask', 'maxHeight',
  'maxWidth', 'minHeight', 'minWidth', 'outline', 'outlineColor', 'overflow',
  'padding', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop',
  'position', 'right', 'stroke', 'strokeDasharray', 'strokeWidth', 'textAlign',
  'textDecoration', 'textShadow', 'textTransform', 'top', 'width', 'wordSpacing',
  'zIndex',
]);
const COLOR_STYLE_KEYS = new Set([
  'backgroundColor', 'borderColor', 'color', 'fill', 'outlineColor', 'stroke',
]);
const DIMENSION_STYLE_KEYS = new Set([
  'borderRadius', 'bottom', 'flexBasis', 'gap', 'height', 'inset', 'left',
  'letterSpacing', 'margin', 'marginBottom', 'marginLeft', 'marginRight',
  'marginTop', 'maxHeight', 'maxWidth', 'minHeight', 'minWidth', 'padding',
  'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTop', 'right',
  'strokeWidth', 'top', 'width', 'wordSpacing',
]);
const ENUM_STYLE_VALUES = new Map(Object.entries({
  alignContent: ['normal', 'start', 'end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly', 'flex-start', 'flex-end', 'baseline'],
  alignItems: ['normal', 'start', 'end', 'center', 'stretch', 'self-start', 'self-end', 'flex-start', 'flex-end', 'baseline'],
  alignSelf: ['auto', 'normal', 'start', 'end', 'center', 'stretch', 'self-start', 'self-end', 'flex-start', 'flex-end', 'baseline'],
  display: ['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'flow-root'],
  flexDirection: ['row', 'row-reverse', 'column', 'column-reverse'],
  flexWrap: ['nowrap', 'wrap', 'wrap-reverse'],
  fontStretch: ['normal', 'ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded'],
  fontStyle: ['normal', 'italic', 'oblique'],
  fontVariant: ['normal', 'none', 'small-caps', 'all-small-caps', 'petite-caps', 'all-petite-caps', 'unicase', 'titling-caps'],
  justifyContent: ['normal', 'start', 'end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly', 'left', 'right', 'flex-start', 'flex-end'],
  overflow: ['visible', 'hidden', 'clip', 'scroll', 'auto'],
  position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  textAlign: ['start', 'end', 'left', 'right', 'center', 'justify', 'match-parent'],
  textTransform: ['none', 'capitalize', 'uppercase', 'lowercase', 'full-width', 'full-size-kana'],
}));
const SAFE_COLOR_NAMES = new Set([
  'black', 'blue', 'currentcolor', 'gray', 'green', 'grey', 'orange', 'pink',
  'purple', 'red', 'transparent', 'white', 'yellow',
]);
const CSS_UNITS = new Set([
  'ch', 'cm', 'deg', 'dvh', 'dvw', 'em', 'ex', 'fr', 'grad', 'in', 'mm', 'ms',
  'pc', 'pt', 'px', 'rad', 'rem', 's', 'svh', 'svw', 'turn', 'vh', 'vmax',
  'vmin', 'vw',
]);
const CSS_COLOR_FUNCTIONS = new Set([
  'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'rgb', 'rgba',
]);
const SAFE_CSS_CHARACTERS = /^[A-Za-z0-9#%(),.+\-/\s]*$/u;
const SAFE_CSS_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:%|[a-z]+)?$/iu;
const SAFE_CSS_INTEGER = /^[+-]?\d+$/u;
const SAFE_CSS_COLOR_FUNCTION = /^(?:hsl|hsla|hwb|lab|lch|oklab|oklch|rgb|rgba)\([0-9.,%+\-/\s]+\)$/iu;
const SAFE_CSS_HEX = /^#(?:[A-F0-9]{3,4}|[A-F0-9]{6}|[A-F0-9]{8})$/iu;
const SAFE_OPENTYPE_FEATURES = new Set([
  'c2sc', 'calt', 'case', 'dlig', 'frac', 'kern', 'liga', 'lnum', 'onum',
  'pnum', 'smcp', 'tnum', 'zero',
  ...Array.from({ length: 20 }, (_, index) => `ss${String(index + 1).padStart(2, '0')}`),
]);

/**
 * Inspect executable ESM bytes before they can enter the public memory tree.
 * Every dependency receives byte-level secret/identifier checks. Newly staged
 * style modules additionally reject embedded semantic copy: their content must
 * arrive through the constructor Unit, never through a saved literal.
 */
export function inspectPublicModuleSources(records, options = {}) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 512) {
    return [{ file: '<closure>', code: 'invalid-module-closure' }];
  }
  const strictFiles = new Set(options.strictFiles ?? []);
  const findings = [];
  const seen = new Set();
  for (const record of records) {
    const file = record?.file;
    const source = record?.source;
    if (typeof file !== 'string' || !SOURCE_FILE.test(file)
        || seen.has(file)
        || typeof source !== 'string' || source.length < 1 || source.length > 250_000) {
      findings.push({ file: typeof file === 'string' ? file : '<module>', code: 'invalid-module-source' });
      continue;
    }
    seen.add(file);
    inspectSensitiveValue(source, file, findings, 'source-bytes');

    let ast;
    try {
      ast = parse(source, {
        sourceFilename: file,
        sourceType: 'module',
        errorRecovery: false,
        plugins: ['jsx', 'classProperties', 'classPrivateProperties', 'importAttributes'],
      });
    } catch {
      findings.push({ file, code: 'module-parse-error' });
      continue;
    }
    inspectModuleLiterals(ast, file, findings, strictFiles.has(file));
  }
  return uniqueModuleFindings(findings);
}

export function assertPublicModuleSources(records, options = {}) {
  const findings = inspectPublicModuleSources(records, options);
  if (findings.length > 0) {
    throw new Error(
      `Built-in module privacy validation failed: ${findings[0].code} at ${findings[0].file}`,
    );
  }
  return records;
}

function inspectModuleLiterals(ast, file, findings, strict) {
  walkSourceAst(ast, [], (node, parent, parentKey, ancestors) => {
    if (['DirectiveLiteral', 'InterpreterDirective', 'RegExpLiteral'].includes(node.type)) {
      const value = String(node.type === 'RegExpLiteral' ? node.pattern : node.value ?? '');
      inspectSensitiveValue(value, file, findings, 'literal');
      if (strict && value.length > 0) {
        findings.push({ file, code: 'embedded-semantic-content' });
      }
      return;
    }
    if (node.type === 'JSXText' && strict && node.value.trim().length > 0) {
      findings.push({ file, code: 'embedded-semantic-content' });
      return;
    }
    if (['CommentBlock', 'CommentLine'].includes(node.type)) {
      const comment = String(node.value);
      if (strict && comment.trim().length > 0) {
        findings.push({ file, code: 'embedded-comment-content' });
      }
      return;
    }
    if (node.type === 'TemplateLiteral' && strict && node.expressions.length > 0) {
      const styleKey = directStyleLiteralKey(node, parent, parentKey, ancestors);
      findings.push({
        file,
        code: styleKey ? 'unsafe-style-literal' : 'embedded-semantic-content',
      });
      return;
    }
    if (node.type === 'TemplateElement') {
      const value = node.value?.cooked ?? node.value?.raw ?? '';
      inspectSensitiveValue(value, file, findings, 'literal');
      if (strict && value.length > 0) {
        const styleKey = directStyleLiteralKey(node, parent, parentKey, ancestors);
        if (!styleKey || !isSafeStyleLiteral(styleKey, value)) {
          findings.push({
            file,
            code: styleKey ? 'unsafe-style-literal' : 'embedded-semantic-content',
          });
        }
      }
      return;
    }
    if (node.type !== 'StringLiteral') return;
    if (isModuleSpecifier(parent, parentKey)) return;
    if (isPropertyKey(parent, parentKey)) {
      inspectSensitiveValue(node.value, file, findings, 'literal');
      if (strict && node.value.length > 0) {
        findings.push({ file, code: 'embedded-semantic-content' });
      }
      return;
    }
    if (isStaticMetadataLiteral(node, ancestors)) return;

    inspectSensitiveValue(node.value, file, findings, 'literal');
    if (!strict || isCanonicalChannel(node, parent)) return;
    const styleKey = directStyleLiteralKey(node, parent, parentKey, ancestors);
    if (styleKey) {
      if (!isSafeStyleLiteral(styleKey, node.value)) {
        findings.push({ file, code: 'unsafe-style-literal' });
      }
      return;
    }
    if (node.value.length > 0) {
      findings.push({ file, code: 'embedded-semantic-content' });
    }
  });
}

function inspectSensitiveValue(value, file, findings, location) {
  for (const [code, pattern] of [
    ['raw-url', RAW_URL],
    ['raw-email', RAW_EMAIL],
    ['secret-like-token', SECRET],
  ]) {
    if (pattern.test(value)) findings.push({ file, code: `${code}-${location}` });
  }
  if (location === 'literal') {
    for (const [code, pattern] of [
      ['raw-uri', DANGEROUS_URI],
      ['raw-host', IPV4_ADDRESS],
      ['raw-host', IPV6_ADDRESS],
      ['raw-host', LOCALHOST],
    ]) {
      if (pattern.test(value)) findings.push({ file, code });
    }
    if (!SAFE_CODE_DOTTED.test(value)
        && !CODE_MEMBER_REFERENCE.test(value)
        && BARE_DOMAIN.test(value)) {
      findings.push({ file, code: 'raw-host' });
    }
  }
}

function isModuleSpecifier(parent, parentKey) {
  return parentKey === 'source' && [
    'ExportAllDeclaration',
    'ExportNamedDeclaration',
    'ImportDeclaration',
  ].includes(parent?.type);
}

function isPropertyKey(parent, parentKey) {
  return parentKey === 'key' && [
    'ClassMethod',
    'ClassProperty',
    'MemberExpression',
    'ObjectMethod',
    'ObjectProperty',
    'PropertyDefinition',
  ].includes(parent?.type);
}

function isStaticMetadataLiteral(node, ancestors) {
  return ancestors.some(({ node: ancestor }) => (
    ['ClassProperty', 'PropertyDefinition'].includes(ancestor.type)
      && ancestor.static
      && ['kind', 'scent'].includes(astPropertyName(ancestor.key))
  ));
}

function directStyleLiteralKey(node, parent, parentKey, ancestors) {
  if (['StringLiteral', 'TemplateLiteral'].includes(node.type)
      && parent?.type === 'ObjectProperty'
      && parentKey === 'value'
      && parent.value === node) {
    const key = astPropertyName(parent.key);
    return STYLE_LITERAL_KEYS.has(key) ? key : null;
  }
  if (node.type !== 'TemplateElement'
      || parent?.type !== 'TemplateLiteral'
      || parentKey !== 'quasis'
      || parent.expressions.length !== 0
      || parent.quasis.length !== 1) return null;
  const property = ancestors.at(-2)?.node;
  if (property?.type !== 'ObjectProperty' || property.value !== parent) return null;
  const key = astPropertyName(property.key);
  return STYLE_LITERAL_KEYS.has(key) ? key : null;
}

function isSafeStyleLiteral(property, rawValue) {
  if (typeof rawValue !== 'string'
      || rawValue.length < 1
      || rawValue.length > 192
      || rawValue !== rawValue.trim()
      || /[\r\n\0{};\\]/u.test(rawValue)) return false;
  const value = rawValue.toLowerCase();
  if (ENUM_STYLE_VALUES.get(property)?.includes(value)) return true;
  if (COLOR_STYLE_KEYS.has(property)) return isSafeCssColor(value, property === 'fill' || property === 'stroke');
  if (DIMENSION_STYLE_KEYS.has(property)) return isSafeDimensionList(value, property);

  switch (property) {
    case 'background':
      return value === 'none' || isSafeCssColor(value) || isSafeGradient(value);
    case 'backgroundImage':
    case 'mask':
      return value === 'none' || isSafeGradient(value);
    case 'backdropFilter':
    case 'filter':
      return isSafeFilter(value);
    case 'border':
    case 'outline':
      return isSafeBorder(value);
    case 'boxShadow':
    case 'textShadow':
      return isSafeShadow(value);
    case 'clipPath':
      return isSafeClipPath(value);
    case 'flexGrow':
      return /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value);
    case 'fontFamily':
      return value.split(',').every((family) => isPublicFontFamily(
        family.trim().replace(/^(['"])(.*)\1$/u, '$2'),
      ));
    case 'fontFeatureSettings':
      return isSafeFontFeatures(value);
    case 'fontSize':
      return ['xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'xxx-large', 'smaller', 'larger'].includes(value)
        || isSafeDimension(value, { allowPercent: true });
    case 'fontWeight':
      return ['normal', 'bold', 'bolder', 'lighter'].includes(value)
        || /^(?:[1-9]00|[1-9]\d{0,2})$/u.test(value);
    case 'grid':
      return isSafeGridTrackList(value);
    case 'gridArea':
    case 'gridColumn':
    case 'gridRow':
      return /^(?:auto|(?:span\s+)?[1-9]\d*(?:\s*\/\s*(?:span\s+)?[1-9]\d*){0,3})$/u.test(value);
    case 'lineHeight':
      return value === 'normal' || SAFE_CSS_NUMBER.test(value);
    case 'strokeDasharray':
      return value === 'none' || value.split(/[ ,]+/u).every((part) => isSafeDimension(part, { allowUnitless: true, allowPercent: true }));
    case 'textDecoration':
      return isSafeTokenExpression(value, new Set([
        ...SAFE_COLOR_NAMES, 'blink', 'dashed', 'dotted', 'double', 'from-font',
        'line-through', 'none', 'overline', 'solid', 'underline', 'wavy',
      ]));
    case 'zIndex':
      return value === 'auto' || SAFE_CSS_INTEGER.test(value);
    default:
      return false;
  }
}

function isSafeCssColor(value, allowNone = false) {
  return (allowNone && value === 'none')
    || SAFE_CSS_HEX.test(value)
    || SAFE_COLOR_NAMES.has(value)
    || SAFE_CSS_COLOR_FUNCTION.test(value);
}

function isSafeDimensionList(value, property) {
  const allowAuto = [
    'bottom', 'flexBasis', 'height', 'inset', 'left', 'margin', 'marginBottom',
    'marginLeft', 'marginRight', 'marginTop', 'maxHeight', 'maxWidth', 'right',
    'top', 'width',
  ].includes(property);
  const allowSizeKeyword = ['height', 'maxHeight', 'maxWidth', 'minHeight', 'minWidth', 'width'].includes(property);
  return value.split(/\s+/u).every((part) => (
    (allowAuto && part === 'auto')
    || (allowSizeKeyword && ['fit-content', 'max-content', 'min-content', 'none'].includes(part))
    || isSafeDimension(part, { allowPercent: true, allowUnitless: part === '0' })
  ));
}

function isSafeDimension(value, options = {}) {
  if (options.allowUnitless && SAFE_CSS_NUMBER.test(value) && !/[a-z%]/iu.test(value)) return true;
  const match = value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z]+|%)$/iu);
  if (!match) return false;
  return (match[2] === '%' && options.allowPercent) || CSS_UNITS.has(match[2].toLowerCase());
}

function isSafeGradient(value) {
  if (!/^(?:repeating-)?(?:conic|linear|radial)-gradient\(/u.test(value)) return false;
  return isSafeTokenExpression(value, new Set([
    ...CSS_COLOR_FUNCTIONS, ...CSS_UNITS, ...SAFE_COLOR_NAMES,
    'at', 'circle', 'closest-corner', 'closest-side', 'conic-gradient',
    'ellipse', 'farthest-corner', 'farthest-side', 'from', 'in',
    'linear-gradient', 'radial-gradient', 'repeating-conic-gradient',
    'repeating-linear-gradient', 'repeating-radial-gradient', 'to',
    'bottom', 'left', 'right', 'top',
  ]));
}

function isSafeBorder(value) {
  if (value === 'none') return true;
  const allowed = new Set([
    ...CSS_COLOR_FUNCTIONS, ...CSS_UNITS, ...SAFE_COLOR_NAMES,
    'dashed', 'dotted', 'double', 'groove', 'hidden', 'inset', 'medium',
    'none', 'outset', 'ridge', 'solid', 'thick', 'thin',
  ]);
  return /\b(?:dashed|dotted|double|groove|hidden|inset|none|outset|ridge|solid)\b/u.test(value)
    && isSafeTokenExpression(value, allowed);
}

function isSafeShadow(value) {
  if (value === 'none') return true;
  return /(?:^|[ (,-])(?:[+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:[a-z]+|%|\b)/u.test(value)
    && isSafeTokenExpression(value, new Set([
      ...CSS_COLOR_FUNCTIONS, ...CSS_UNITS, ...SAFE_COLOR_NAMES, 'inset',
    ]));
}

function isSafeFilter(value) {
  if (value === 'none') return true;
  if (!/^(?:blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|opacity|saturate|sepia)\(/u.test(value)) return false;
  return isSafeTokenExpression(value, new Set([
    ...CSS_COLOR_FUNCTIONS, ...CSS_UNITS, ...SAFE_COLOR_NAMES, 'blur',
    'brightness', 'contrast', 'drop-shadow', 'grayscale', 'hue-rotate',
    'invert', 'opacity', 'saturate', 'sepia',
  ]));
}

function isSafeClipPath(value) {
  if (value === 'none') return true;
  if (!/^(?:circle|ellipse|inset|polygon)\(/u.test(value)) return false;
  return isSafeTokenExpression(value, new Set([
    ...CSS_UNITS, 'at', 'circle', 'closest-side', 'ellipse', 'evenodd',
    'farthest-side', 'inset', 'nonzero', 'polygon', 'round',
  ]));
}

function isSafeGridTrackList(value) {
  if (value === 'none') return true;
  return isSafeTokenExpression(value, new Set([
    ...CSS_UNITS, 'auto', 'auto-fill', 'auto-fit', 'fit-content', 'max-content',
    'min-content', 'minmax', 'repeat',
  ]));
}

function isSafeFontFeatures(value) {
  if (value === 'normal') return true;
  return value.split(',').every((feature) => {
    const match = feature.trim().match(/^['"]([a-z0-9]{4})['"](?:\s+(?:on|off|\d+))?$/u);
    return Boolean(match && SAFE_OPENTYPE_FEATURES.has(match[1]));
  });
}

function isSafeTokenExpression(value, allowedIdentifiers) {
  if (!SAFE_CSS_CHARACTERS.test(value) || /(?:url|var|attr|env)\s*\(/iu.test(value)) return false;
  for (const hash of value.match(/#[A-Za-z0-9]+/gu) ?? []) {
    if (!SAFE_CSS_HEX.test(hash)) return false;
  }
  const withoutHashes = value.replace(/#[A-Za-z0-9]+/gu, '');
  for (const identifier of withoutHashes.match(/[A-Za-z][A-Za-z-]*/gu) ?? []) {
    if (!allowedIdentifiers.has(identifier.toLowerCase())) return false;
  }
  return true;
}

function isCanonicalChannel(node, parent) {
  if (parent?.type !== 'CallExpression' || parent.arguments[1] !== node) return false;
  return parent.callee?.type === 'Identifier'
    && ['writeFilter', 'writeTransform'].includes(parent.callee.name)
    && TECHNICAL_TOKEN.test(node.value);
}

function astPropertyName(node) {
  if (node?.type === 'Identifier' || node?.type === 'PrivateName') {
    return node.name ?? node.id?.name ?? null;
  }
  if (node?.type === 'StringLiteral') return node.value;
  return null;
}

function walkSourceAst(node, ancestors, visit, parent = null, parentKey = null) {
  if (!node || typeof node !== 'object') return;
  visit(node, parent, parentKey, ancestors);
  const nextAncestors = [...ancestors, { node, key: parentKey }];
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'start', 'end', 'extra'].includes(key)) continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => walkSourceAst(entry, nextAncestors, visit, node, key));
    } else if (value && typeof value === 'object') {
      walkSourceAst(value, nextAncestors, visit, node, key);
    }
  }
}

function uniqueModuleFindings(findings) {
  const byKey = new Map();
  findings.forEach((item) => byKey.set(`${item.file}\u0000${item.code}`, item));
  return [...byKey.values()].sort((left, right) => (
    left.file.localeCompare(right.file) || left.code.localeCompare(right.code)
  ));
}
