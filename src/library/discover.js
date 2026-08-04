import fs from 'node:fs/promises';
import path from 'node:path';

import { parse } from '@babel/parser';

import {
  loadPromotionLedger,
  resolvePromotedEntries,
} from './promotion-ledger.js';

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.jsx']);

/**
 * Read the public Unit/Behaviour library without evaluating any of its code.
 *
 * The returned records are source navigation data, not a runtime registry.
 */
export async function discoverLibrary(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const roots = [
    { type: 'unit', directory: options.unitsDirectory ?? 'units' },
    { type: 'behaviour', directory: options.behavioursDirectory ?? 'behaviours' },
  ];
  const modules = [];
  const entries = [];
  const diagnostics = [];

  for (const root of roots) {
    const absoluteDirectory = path.resolve(rootDir, root.directory);
    for (const filename of await collectSourceFiles(absoluteDirectory)) {
      const source = await fs.readFile(filename, 'utf8');
      const relativeFile = toPosix(path.relative(rootDir, filename));
      let ast;
      try {
        ast = parseModule(source, relativeFile);
      } catch (error) {
        diagnostics.push(diagnostic(
          'parse-error',
          relativeFile,
          `Cannot parse module: ${firstLine(error.message)}`,
          error.loc,
        ));
        continue;
      }

      const moduleRecord = {
        file: relativeFile,
        filename,
        source,
        ast,
        type: root.type,
        imports: collectStaticSpecifiers(ast),
      };
      modules.push(moduleRecord);

      for (const exported of findExportedClasses(ast)) {
        const kind = readOwnStaticKind(exported.node);
        entries.push({
          type: root.type,
          kind,
          export: exported.exportName,
          className: exported.className,
          hasSuperClass: Boolean(exported.node.superClass),
          superClass: propertyName(exported.node.superClass),
          source: relativeFile,
          loc: exported.node.loc?.start ?? null,
        });
      }
    }
  }

  const coreSeeds = await collectDependencySeeds(
    rootDir,
    options.coreDirectory ?? 'core',
  );
  const dependencyGraph = await collectStaticDependencyGraph(
    rootDir,
    [...modules, ...coreSeeds.modules],
  );
  diagnostics.push(...coreSeeds.diagnostics);
  diagnostics.push(...dependencyGraph.diagnostics);

  modules.sort((left, right) => left.file.localeCompare(right.file));
  entries.sort(compareEntries);
  diagnostics.sort(compareDiagnostics);
  const ledgerValidation = await loadPromotionLedger({
    rootDir,
    ledger: options.promotionLedger,
    ledgerFile: options.promotionLedgerFile,
  });
  const promotion = resolvePromotedEntries(
    {
      rootDir,
      modules,
      dependencyModules: dependencyGraph.modules,
      entries,
      diagnostics,
    },
    ledgerValidation,
  );
  return {
    rootDir,
    modules,
    dependencyModules: dependencyGraph.modules,
    entries,
    publicEntries: promotion.promotedEntries,
    diagnostics,
    promotion,
  };
}

/**
 * Read the complete relative ESM closure without evaluating it. Bare package
 * specifiers stay on each module record so the promotion ledger can bind them
 * deterministically without attempting network or package resolution.
 */
async function collectStaticDependencyGraph(rootDir, roots) {
  const byFile = new Map(roots.map((module) => [module.file, module]));
  const queue = [...roots];
  const visited = new Set();
  const diagnostics = [];

  while (queue.length > 0) {
    const module = queue.shift();
    if (visited.has(module.file)) continue;
    visited.add(module.file);

    for (const imported of module.imports ?? []) {
      if (!isRelativeSpecifier(imported.value)) continue;
      const filename = path.resolve(path.dirname(module.filename), imported.value);
      const relativeFile = relativeInside(rootDir, filename);
      if (relativeFile === null) {
        diagnostics.push(diagnostic(
          'dependency-import-escapes-root',
          module.file,
          `Static dependency escapes repository root: ${imported.value}`,
          imported.loc,
        ));
        continue;
      }
      if (byFile.has(relativeFile)) {
        queue.push(byFile.get(relativeFile));
        continue;
      }

      let source;
      try {
        source = await fs.readFile(filename, 'utf8');
      } catch (error) {
        diagnostics.push(diagnostic(
          'unresolved-static-dependency',
          module.file,
          `Cannot read static dependency: ${imported.value}`,
          imported.loc,
        ));
        continue;
      }

      let ast = null;
      let imports = [];
      if (SOURCE_EXTENSIONS.has(path.extname(filename))) {
        try {
          ast = parseModule(source, relativeFile);
          imports = collectStaticSpecifiers(ast);
        } catch (error) {
          diagnostics.push(diagnostic(
            'dependency-parse-error',
            relativeFile,
            `Cannot parse static dependency: ${firstLine(error.message)}`,
            error.loc,
          ));
          continue;
        }
      }

      const record = {
        file: relativeFile,
        filename,
        source,
        ast,
        imports,
        type: null,
      };
      byFile.set(relativeFile, record);
      queue.push(record);
    }
  }

  return {
    modules: [...byFile.values()].sort((left, right) => left.file.localeCompare(right.file)),
    diagnostics: diagnostics.sort(compareDiagnostics),
  };
}

async function collectDependencySeeds(rootDir, directory) {
  const modules = [];
  const diagnostics = [];
  const absoluteDirectory = path.resolve(rootDir, directory);
  for (const filename of await collectSourceFiles(absoluteDirectory)) {
    const source = await fs.readFile(filename, 'utf8');
    const relativeFile = toPosix(path.relative(rootDir, filename));
    try {
      const ast = parseModule(source, relativeFile);
      modules.push({
        file: relativeFile,
        filename,
        source,
        ast,
        imports: collectStaticSpecifiers(ast),
        type: null,
      });
    } catch (error) {
      diagnostics.push(diagnostic(
        'dependency-parse-error',
        relativeFile,
        `Cannot parse static dependency: ${firstLine(error.message)}`,
        error.loc,
      ));
    }
  }
  return { modules, diagnostics };
}

export function parseModule(source, filename = '<source>') {
  return parse(source, {
    sourceFilename: filename,
    sourceType: 'module',
    errorRecovery: false,
    plugins: ['jsx', 'classProperties', 'classPrivateProperties', 'importAttributes'],
  });
}

export function collectStaticSpecifiers(ast) {
  const specifiers = [];
  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration'
        || statement.type === 'ExportAllDeclaration'
        || (statement.type === 'ExportNamedDeclaration' && statement.source)) {
      specifiers.push({
        value: statement.source.value,
        loc: statement.source.loc?.start ?? statement.loc?.start ?? null,
      });
    }
  }
  return specifiers;
}

export function findExportedClasses(ast) {
  const declarations = new Map();
  const exported = [];

  for (const statement of ast.program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration'
      ? statement.declaration
      : statement;
    if (declaration?.type === 'ClassDeclaration' && declaration.id) {
      declarations.set(declaration.id.name, declaration);
    }
  }

  for (const statement of ast.program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration?.type === 'ClassDeclaration') {
        const node = statement.declaration;
        exported.push({
          node,
          className: node.id?.name ?? null,
          exportName: node.id?.name ?? 'default',
        });
      }
      if (!statement.source) {
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier') continue;
          const localName = identifierName(specifier.local);
          const node = declarations.get(localName);
          if (!node) continue;
          exported.push({
            node,
            className: node.id?.name ?? localName,
            exportName: identifierName(specifier.exported),
          });
        }
      }
    } else if (statement.type === 'ExportDefaultDeclaration'
        && statement.declaration?.type === 'ClassDeclaration') {
      const node = statement.declaration;
      exported.push({
        node,
        className: node.id?.name ?? 'default',
        exportName: 'default',
      });
    }
  }

  const seen = new Set();
  return exported.filter((record) => {
    const key = `${record.node.start}:${record.exportName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readOwnStaticKind(classNode) {
  for (const member of classNode.body.body) {
    if (!member.static || propertyName(member.key) !== 'kind') continue;
    if (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') {
      return stringValue(member.value);
    }
    if (member.type === 'ClassMethod' && member.kind === 'get') {
      const returnStatement = member.body.body.find((statement) => statement.type === 'ReturnStatement');
      return stringValue(returnStatement?.argument);
    }
  }
  return null;
}

export function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    if (Array.isArray(value)) {
      for (const child of value) walkAst(child, visit);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walkAst(value, visit);
    }
  }
}

export function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier' || node.type === 'PrivateName') return node.name ?? node.id?.name ?? null;
  if (node.type === 'StringLiteral' || node.type === 'Literal') return String(node.value);
  return null;
}

function stringValue(node) {
  return node?.type === 'StringLiteral' || (node?.type === 'Literal' && typeof node.value === 'string')
    ? node.value
    : null;
}

function identifierName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'StringLiteral') return node.value;
  return null;
}

function isRelativeSpecifier(value) {
  return typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'));
}

function relativeInside(rootDir, filename) {
  const relative = path.relative(rootDir, filename);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return toPosix(relative);
}

async function collectSourceFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return files;
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(target));
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

function diagnostic(code, file, message, loc = null) {
  return {
    code,
    file,
    line: loc?.line ?? null,
    column: loc?.column ?? null,
    message,
  };
}

function firstLine(value) {
  return String(value).split(/\r?\n/u, 1)[0];
}

function compareEntries(left, right) {
  return String(left.kind).localeCompare(String(right.kind))
    || left.source.localeCompare(right.source)
    || left.export.localeCompare(right.export);
}

function compareDiagnostics(left, right) {
  return left.file.localeCompare(right.file)
    || (left.line ?? 0) - (right.line ?? 0)
    || left.code.localeCompare(right.code);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}
