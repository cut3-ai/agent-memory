import fs from 'node:fs/promises';
import path from 'node:path';

import { parse } from '@babel/parser';

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
          source: relativeFile,
          loc: exported.node.loc?.start ?? null,
        });
      }
    }
  }

  modules.sort((left, right) => left.file.localeCompare(right.file));
  entries.sort(compareEntries);
  diagnostics.sort(compareDiagnostics);
  return { rootDir, modules, entries, diagnostics };
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
