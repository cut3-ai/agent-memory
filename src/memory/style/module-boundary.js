import path from 'node:path';

import {
  classMethod,
  literalString,
  normalizeFile,
  propertyName,
  resolveImport,
  walk,
} from './ast.js';

export const SAFE_KIND = /^(?:unit|behaviour)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

const UNIT_SLOT = /^(?:child|content|copy|media|unit)$/u;
const FORBIDDEN_INPUT = /^(?:appearance|backend|channel|component|config|css|factory|options|path|property|props|read|render|renderer|signal|style|value)$/u;
const RENDERER_STATE = /^(?:appearance|backend|component|css|factory|props|render|renderer|style)$/u;
const FORBIDDEN_LIBRARY_IMPORT = /(?:^|\/)(?:adapters?|drivers?|renderers?|runtime)(?:\/|$)|(?:^|\/)(?:behaviours|core|index|units)\.js$/u;

export function inspectTopLevel(ast, violations) {
  let exportedClassesCount = 0;
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (statement.specifiers.length === 0) violations.push('top-level-side-effect');
      if (statement.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')) {
        violations.push('barrel-or-namespace-import');
      }
      continue;
    }
    if (statement.type === 'ExportAllDeclaration') {
      violations.push('module-reexport');
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.source || statement.specifiers.length > 0) violations.push('module-reexport');
      if (statement.declaration?.type === 'ClassDeclaration') {
        exportedClassesCount += 1;
        inspectClassDefinitionEffects(statement.declaration, violations);
      } else if (!statement.specifiers.length) violations.push('top-level-declaration-forbidden');
      continue;
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      if (statement.declaration?.type !== 'ClassDeclaration') violations.push('module-reexport');
      else {
        exportedClassesCount += 1;
        inspectClassDefinitionEffects(statement.declaration, violations);
      }
      continue;
    }
    if (['ClassDeclaration', 'FunctionDeclaration', 'VariableDeclaration'].includes(statement.type)) {
      violations.push('top-level-declaration-forbidden');
    } else {
      violations.push('top-level-side-effect');
    }
  }
  if (exportedClassesCount !== 1) violations.push('style-module-single-exported-class');
}

function inspectClassDefinitionEffects(classNode, violations) {
  if (classNode.body.body.some((member) => member.type === 'StaticBlock' || member.computed)) {
    violations.push('top-level-side-effect');
  }
}

export function inspectDirectBase(classNode, type, imports, violations) {
  const superName = classNode.superClass?.type === 'Identifier' ? classNode.superClass.name : null;
  const binding = imports.get(superName);
  const expected = type === 'unit' ? 'Unit' : type === 'behaviour' ? 'Behaviour' : null;
  const expectedSuffix = type === 'unit' ? 'core/Unit.js' : 'core/Behaviour.js';
  if (!binding || binding.imported !== expected || !binding.resolved.endsWith(expectedSuffix)) {
    violations.push('direct-canonical-base-required');
  }
}

export function inspectConstructorInputs(classNode, type, violations) {
  const constructor = classMethod(classNode, 'constructor');
  if (!constructor) {
    violations.push('explicit-constructor-required');
    return;
  }
  if (constructor.params.length !== 1 || constructor.params[0]?.type !== 'Identifier') {
    violations.push('semantic-unit-slot-required');
    return;
  }
  const slot = constructor.params[0].name;
  if ((type === 'unit' && !UNIT_SLOT.test(slot)) || (type === 'behaviour' && slot !== 'unit')) {
    violations.push('semantic-unit-slot-required');
  }
  if (FORBIDDEN_INPUT.test(slot)) violations.push('open-style-input');
}

export function inspectRendererState(classNode, violations) {
  walk(classNode, (node) => {
    if (node.type !== 'MemberExpression' || node.object?.type !== 'ThisExpression') return;
    if (RENDERER_STATE.test(propertyName(node.property) ?? '')) {
      violations.push('renderer-state-in-memory-class');
    }
  });
}

export function inspectModuleImports(ast, sourceFile, violations) {
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const specifier = statement.source.value;
    if (typeof specifier !== 'string' || (!specifier.startsWith('./') && !specifier.startsWith('../'))) {
      violations.push('external-library-import');
      continue;
    }
    const resolved = resolveImport(sourceFile, specifier);
    if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
      violations.push('import-escapes-library');
    }
    if (FORBIDDEN_LIBRARY_IMPORT.test(resolved)) violations.push('driver-or-barrel-import');
  }
}

export function inspectDynamicLoading(ast, violations) {
  walk(ast, (node) => {
    if (node.type === 'ImportExpression'
        || (node.type === 'CallExpression' && node.callee?.type === 'Import')) {
      violations.push('dynamic-import');
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier'
        && node.callee.name === 'require') {
      violations.push('commonjs-require');
    }
  });
}

export function importBindings(ast, sourceFile) {
  const bindings = new Map();
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration' || typeof statement.source.value !== 'string') continue;
    const resolved = resolveImport(sourceFile, statement.source.value);
    for (const specifier of statement.specifiers) {
      if (!['ImportSpecifier', 'ImportDefaultSpecifier'].includes(specifier.type)) continue;
      bindings.set(specifier.local.name, {
        imported: specifier.type === 'ImportDefaultSpecifier'
          ? 'default' : propertyName(specifier.imported),
        resolved,
        specifier: statement.source.value,
        type: resolved.startsWith('units/')
          ? 'unit'
          : resolved.startsWith('behaviours/') ? 'behaviour' : 'other',
      });
    }
  }
  return bindings;
}

export function exportedClasses(ast) {
  const declarations = new Map();
  const result = [];
  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration'
      ? statement.declaration : statement;
    if (declaration?.type === 'ClassDeclaration' && declaration.id) {
      declarations.set(declaration.id.name, declaration);
    }
  }
  for (const statement of ast.program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration?.type === 'ClassDeclaration') {
        result.push({ node: statement.declaration, exportName: statement.declaration.id?.name });
      }
      if (!statement.source) {
        for (const specifier of statement.specifiers) {
          const local = propertyName(specifier.local);
          if (declarations.has(local)) {
            result.push({ node: declarations.get(local), exportName: propertyName(specifier.exported) });
          }
        }
      }
    } else if (statement.type === 'ExportDefaultDeclaration'
        && statement.declaration?.type === 'ClassDeclaration') {
      result.push({ node: statement.declaration, exportName: 'default' });
    }
  }
  return result;
}

export function selectCandidate(exported, expectedExport, expectedKind) {
  if (expectedExport !== undefined) {
    return exported.find((entry) => entry.exportName === expectedExport) ?? null;
  }
  if (expectedKind !== undefined) {
    return exported.find((entry) => readStaticKind(entry.node) === expectedKind) ?? null;
  }
  return exported.length === 1 ? exported[0] : null;
}

export function readStaticKind(classNode) {
  const member = classNode?.body?.body?.find((entry) => (
    entry.static
      && ['ClassProperty', 'PropertyDefinition'].includes(entry.type)
      && propertyName(entry.key) === 'kind'
  ));
  return literalString(member?.value);
}

export function dependencyRegistry(value) {
  const records = new Map();
  const add = (key, raw) => {
    const moduleSource = typeof raw === 'string' ? raw : raw?.moduleSource ?? raw?.source;
    if (typeof moduleSource !== 'string') return;
    const sourceFile = normalizeFile(raw?.sourceFile ?? raw?.file ?? raw?.filename ?? key);
    const record = { moduleSource, sourceFile };
    for (const candidate of [key, sourceFile]) {
      if (typeof candidate === 'string') records.set(normalizeFile(candidate), record);
    }
  };
  if (value instanceof Map) {
    for (const [key, raw] of value) add(key, raw);
  } else if (Array.isArray(value)) {
    value.forEach((raw) => add(raw?.sourceFile ?? raw?.file ?? raw?.filename, raw));
  } else if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value)) add(key, raw);
  }
  return {
    supplied: value !== undefined && value !== null,
    original: value,
    find(binding) {
      return records.get(normalizeFile(binding.resolved))
        ?? records.get(normalizeFile(binding.specifier));
    },
  };
}
