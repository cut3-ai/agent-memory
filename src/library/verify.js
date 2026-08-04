import fs from 'node:fs/promises';
import path from 'node:path';

import {
  collectStaticSpecifiers,
  discoverLibrary,
  parseModule,
  propertyName,
  walkAst,
} from './discover.js';

export const FORBIDDEN_LIBRARY_FIELDS = Object.freeze([
  'backend',
  'componentId',
  'factory',
  'factoryId',
  'renderer',
  'runtime',
]);

export const HEAVY_DOM_IMPORTS = Object.freeze([
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  '@remotion/three',
  'remotion-three',
]);

/** Validate a discovery result without importing the discovered modules. */
export function verifyDiscovery(discovery, options = {}) {
  const forbiddenFields = new Set(options.forbiddenFields ?? FORBIDDEN_LIBRARY_FIELDS);
  const errors = [...discovery.diagnostics];
  const kinds = new Map();
  const modulesByFile = new Map(discovery.modules.map((module) => [module.file, module]));

  for (const entry of discovery.entries) {
    const expectedBase = entry.type === 'unit' ? 'Unit' : 'Behaviour';
    if (!entry.hasSuperClass || entry.superClass !== expectedBase) {
      errors.push(issue(
        'invalid-base-class',
        entry.source,
        `${entry.className} must directly extend ${expectedBase}`,
        entry.loc,
      ));
    }
    if (entry.hasSuperClass
        && entry.superClass === expectedBase
        && !hasCanonicalBaseImport(modulesByFile.get(entry.source), expectedBase)) {
      errors.push(issue(
        'invalid-base-import',
        entry.source,
        `${entry.className} must bind ${expectedBase} through its canonical core ESM import`,
        entry.loc,
      ));
    }
    if (!entry.kind) {
      errors.push(issue(
        'missing-own-static-kind',
        entry.source,
        `${entry.className} must declare its own literal static kind`,
        entry.loc,
      ));
    } else if (!entry.kind.startsWith(`${entry.type}.`)) {
      errors.push(issue(
        'invalid-kind-prefix',
        entry.source,
        `${entry.className} kind must start with ${entry.type}.`,
        entry.loc,
      ));
    } else if (kinds.has(entry.kind)) {
      errors.push(issue(
        'duplicate-kind',
        entry.source,
        `${entry.kind} is already declared by ${kinds.get(entry.kind)}`,
        entry.loc,
      ));
    } else {
      kinds.set(entry.kind, `${entry.source}#${entry.export}`);
    }
  }

  const verifiedModules = new Set();
  for (const module of discovery.dependencyModules ?? discovery.modules) {
    if (!module.ast || verifiedModules.has(module.file)) continue;
    verifiedModules.add(module.file);
    verifyModuleAst(module, forbiddenFields, errors);
  }

  errors.sort(compareIssues);
  return {
    ok: errors.length === 0,
    entries: discovery.entries.length,
    modules: discovery.modules.length,
    errors,
  };
}

function hasCanonicalBaseImport(module, expectedBase) {
  if (!module?.ast) return false;
  const canonicalSource = expectedBase === 'Unit' ? 'core/Unit.js' : 'core/Behaviour.js';
  for (const statement of module.ast.program.body) {
    if (statement.type !== 'ImportDeclaration'
        || resolveStaticImport(module.file, statement.source.value) !== canonicalSource) {
      continue;
    }
    if (statement.specifiers.some((specifier) => (
      specifier.type === 'ImportSpecifier'
      && propertyName(specifier.imported) === expectedBase
      && specifier.local?.name === expectedBase
    ))) return true;
  }
  return false;
}

function resolveStaticImport(importer, specifier) {
  if (!isRelativeSpecifier(specifier)) return null;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  if (resolved === '..' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) return null;
  return resolved.replace(/^\.\//u, '');
}

export async function verifyLibrary(options = {}) {
  const discovery = await discoverLibrary(options);
  return verifyDiscovery(discovery, options);
}

export function assertValidLibrary(report) {
  if (report.ok) return report;
  const summary = report.errors
    .map((error) => `${error.file}${formatLocation(error)} [${error.code}] ${error.message}`)
    .join('\n');
  throw new Error(`Static library verification failed:\n${summary}`);
}

/**
 * Trace the exact static ESM graph reachable from one or more entry modules.
 * Bare package imports are reported but never loaded or executed.
 */
export async function traceStaticImports(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const queue = (options.entries ?? []).map((entry) => path.resolve(rootDir, entry));
  const visited = new Set();
  const files = [];
  const externalImports = [];
  const errors = [];

  while (queue.length > 0) {
    const filename = queue.shift();
    if (visited.has(filename)) continue;
    visited.add(filename);
    const relativeFile = relativeToRoot(rootDir, filename);
    if (relativeFile === null) {
      errors.push(issue('import-escapes-root', '<entry>', `Entry escapes root: ${filename}`));
      continue;
    }

    let source;
    try {
      source = await fs.readFile(filename, 'utf8');
    } catch (error) {
      errors.push(issue('unresolved-static-import', relativeFile, firstLine(error.message)));
      continue;
    }

    let ast;
    try {
      ast = parseModule(source, relativeFile);
    } catch (error) {
      errors.push(issue('parse-error', relativeFile, firstLine(error.message), error.loc));
      continue;
    }
    files.push(relativeFile);
    findNonStaticImports(ast, relativeFile, errors);

    for (const specifier of collectStaticSpecifiers(ast)) {
      if (!isRelativeSpecifier(specifier.value)) {
        externalImports.push({ importer: relativeFile, specifier: specifier.value });
        continue;
      }
      const dependency = path.resolve(path.dirname(filename), specifier.value);
      if (relativeToRoot(rootDir, dependency) === null) {
        errors.push(issue(
          'import-escapes-root',
          relativeFile,
          `Static import escapes root: ${specifier.value}`,
          specifier.loc,
        ));
        continue;
      }
      queue.push(dependency);
    }
  }

  files.sort();
  externalImports.sort((left, right) => left.importer.localeCompare(right.importer)
    || left.specifier.localeCompare(right.specifier));
  errors.sort(compareIssues);
  return { rootDir, files, externalImports, errors };
}

/**
 * Bundler-free tree-shaking architecture probe for the DOM entry graph.
 * It proves that heavyweight modules are unreachable through static imports;
 * it does not claim to reproduce any particular bundler's optimizer.
 */
export async function verifyDomTreeShaking(options = {}) {
  const trace = await traceStaticImports(options);
  const forbiddenSpecifiers = options.forbiddenSpecifiers ?? HEAVY_DOM_IMPORTS;
  const forbiddenPathSegments = options.forbiddenPathSegments ?? ['/three/'];
  const errors = [...trace.errors];

  for (const imported of trace.externalImports) {
    if (forbiddenSpecifiers.some((forbidden) => packageMatches(imported.specifier, forbidden))) {
      errors.push(issue(
        'heavy-import-reachable-from-dom',
        imported.importer,
        `DOM graph reaches ${imported.specifier}`,
      ));
    }
  }
  for (const file of trace.files) {
    const normalized = `/${file.toLowerCase()}`;
    if (forbiddenPathSegments.some((segment) => normalized.includes(segment.toLowerCase()))) {
      errors.push(issue(
        'heavy-module-reachable-from-dom',
        file,
        'DOM graph reaches a heavyweight module path',
      ));
    }
  }

  errors.sort(compareIssues);
  return {
    ok: errors.length === 0,
    files: trace.files,
    externalImports: trace.externalImports,
    errors,
  };
}

function verifyModuleAst(module, forbiddenFields, errors) {
  findNonStaticImports(module.ast, module.file, errors);
  walkAst(module.ast.program, (node) => {
    if ((node.type === 'ClassProperty' || node.type === 'PropertyDefinition'
        || node.type === 'ClassMethod' || node.type === 'ClassPrivateProperty')
        && forbiddenFields.has(propertyName(node.key))) {
      errors.push(issue(
        'forbidden-library-field',
        module.file,
        `Class field ${propertyName(node.key)} is renderer/runtime metadata`,
        node.loc?.start,
      ));
    }
    if (node.type === 'AssignmentExpression'
        && node.left?.type === 'MemberExpression'
        && node.left.object?.type === 'ThisExpression'
        && forbiddenFields.has(propertyName(node.left.property))) {
      errors.push(issue(
        'forbidden-library-field',
        module.file,
        `Instance field ${propertyName(node.left.property)} is renderer/runtime metadata`,
        node.loc?.start,
      ));
    }
    if (node.type === 'ExportNamedDeclaration') {
      for (const specifier of node.specifiers ?? []) {
        const name = propertyName(specifier.exported);
        if (forbiddenFields.has(name)) {
          errors.push(issue(
            'forbidden-library-export',
            module.file,
            `Export ${name} exposes renderer/runtime metadata`,
            specifier.loc?.start,
          ));
        }
      }
      const declarationName = node.declaration?.id?.name;
      if (forbiddenFields.has(declarationName)) {
        errors.push(issue(
          'forbidden-library-export',
          module.file,
          `Export ${declarationName} exposes renderer/runtime metadata`,
          node.loc?.start,
        ));
      }
      if (node.declaration?.type === 'VariableDeclaration') {
        for (const declaration of node.declaration.declarations) {
          const name = declaration.id?.type === 'Identifier' ? declaration.id.name : null;
          if (!forbiddenFields.has(name)) continue;
          errors.push(issue(
            'forbidden-library-export',
            module.file,
            `Export ${name} exposes renderer/runtime metadata`,
            declaration.loc?.start,
          ));
        }
      }
    }
  });
}

function findNonStaticImports(ast, file, errors) {
  walkAst(ast.program, (node) => {
    const dynamicImport = node.type === 'ImportExpression'
      || (node.type === 'CallExpression' && node.callee?.type === 'Import');
    if (dynamicImport) {
      errors.push(issue(
        'dynamic-import',
        file,
        'Library modules may only use static ESM imports',
        node.loc?.start,
      ));
    }
    if (node.type === 'CallExpression'
        && node.callee?.type === 'Identifier'
        && node.callee.name === 'require') {
      errors.push(issue(
        'commonjs-require',
        file,
        'Library modules may only use static ESM imports',
        node.loc?.start,
      ));
    }
    if (node.type === 'CallExpression'
        && node.callee?.type === 'Identifier'
        && ['eval', 'Function'].includes(node.callee.name)) {
      errors.push(issue(
        'runtime-code-generation',
        file,
        'Library modules cannot evaluate or construct executable source',
        node.loc?.start,
      ));
    }
    if (node.type === 'NewExpression'
        && node.callee?.type === 'Identifier'
        && node.callee.name === 'Function') {
      errors.push(issue(
        'runtime-code-generation',
        file,
        'Library modules cannot evaluate or construct executable source',
        node.loc?.start,
      ));
    }
  });
}

function isRelativeSpecifier(value) {
  return value.startsWith('./') || value.startsWith('../');
}

function packageMatches(specifier, forbidden) {
  return specifier === forbidden || specifier.startsWith(`${forbidden}/`);
}

function relativeToRoot(rootDir, filename) {
  const relative = path.relative(rootDir, filename);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

function issue(code, file, message, loc = null) {
  return {
    code,
    file,
    line: loc?.line ?? null,
    column: loc?.column ?? null,
    message,
  };
}

function formatLocation(error) {
  return error.line === null ? '' : `:${error.line}:${(error.column ?? 0) + 1}`;
}

function firstLine(value) {
  return String(value).split(/\r?\n/u, 1)[0];
}

function compareIssues(left, right) {
  return left.file.localeCompare(right.file)
    || (left.line ?? 0) - (right.line ?? 0)
    || left.code.localeCompare(right.code);
}
