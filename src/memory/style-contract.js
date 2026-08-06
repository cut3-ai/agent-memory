import { inspectBehaviour } from './style/behaviour-contract.js';
import {
  dependencyRegistry,
  exportedClasses,
  importBindings,
  inspectConstructorInputs,
  inspectDirectBase,
  inspectDynamicLoading,
  inspectModuleImports,
  inspectRendererState,
  inspectTopLevel,
  readStaticKind,
  SAFE_KIND,
  selectCandidate,
} from './style/module-boundary.js';
import { emptyFacts, styleReport } from './style/report.js';
import { readStyleScent } from './style/scent.js';
import { normalizeFile, parseModule } from './style/ast.js';
import { inspectUnit } from './style/unit-contract.js';
import { bindScentEvidence } from './style/evidence.js';

export { STYLE_MEMORY_CONTRACT_VERSION } from './style/report.js';
export { readStyleScent, STYLE_SCENT_KEYS } from './style/scent.js';
export { STYLE_EVIDENCE_VERSION, verifyCueEvidence } from './style/evidence.js';

/**
 * Parse and prove one proposed style-memory class without evaluating it.
 *
 * `dependencyModules` (alias: `modules`) may be a Map, an object keyed by
 * import specifier/resolved file, or discovery-style module records. When the
 * collection is supplied, every attached custom Behaviour must be present and
 * must independently satisfy this contract.
 */
export function inspectStyleModuleSource(sourceOrInput, options = {}) {
  const input = typeof sourceOrInput === 'string'
    ? { ...options, moduleSource: sourceOrInput }
    : { ...(sourceOrInput ?? {}), ...options };
  const moduleSource = input.moduleSource ?? input.source;
  const sourceFile = normalizeFile(input.sourceFile ?? input.filename ?? '<style-memory>');
  const expectedType = input.type;
  const expectedKind = input.kind;
  const expectedExport = input.exportName ?? input.export;
  const dependencies = dependencyRegistry(input.dependencyModules ?? input.modules);
  const dependencyStack = new Set(input._dependencyStack ?? []);
  const violations = [];
  let ast;
  try {
    ast = parseModule(moduleSource, sourceFile);
  } catch {
    return styleReport({ violations: ['module-parse-error'] });
  }

  inspectTopLevel(ast, violations);
  inspectModuleImports(ast, sourceFile, violations);
  inspectDynamicLoading(ast, violations);
  const exported = exportedClasses(ast);
  const selected = selectCandidate(exported, expectedExport, expectedKind);
  if (!selected) return styleReport({ violations: [...violations, 'candidate-class-unavailable'] });

  const kind = readStaticKind(selected.node);
  const type = kind?.startsWith('unit.')
    ? 'unit'
    : kind?.startsWith('behaviour.') ? 'behaviour' : null;
  if (!kind || !SAFE_KIND.test(kind)) violations.push('invalid-static-kind');
  if (expectedKind !== undefined && kind !== expectedKind) violations.push('kind-mismatch');
  if (expectedType !== undefined && type !== expectedType) violations.push('type-mismatch');

  const scentRead = readStyleScent(selected.node, type);
  violations.push(...scentRead.violations);
  const imports = importBindings(ast, sourceFile);
  inspectDirectBase(selected.node, type, imports, violations);
  inspectConstructorInputs(selected.node, type, violations);
  inspectRendererState(selected.node, violations);

  const inspected = type === 'unit'
    ? inspectUnit(selected.node, imports, violations, {
      dependencies,
      dependencyStack: new Set([...dependencyStack, sourceFile]),
      inspectDependency: inspectStyleModuleSource,
    })
    : type === 'behaviour'
      ? inspectBehaviour(selected.node, imports, violations)
      : emptyFacts();
  const { evidence: rawEvidence = null, ...facts } = inspected;
  const bound = bindScentEvidence(scentRead.scent, type, rawEvidence);
  violations.push(...bound.violations);

  return styleReport({
    kind,
    type,
    exportName: selected.exportName,
    scent: scentRead.scent,
    facts,
    evidence: bound.evidence,
    violations,
  });
}

export function assertStyleMemory(reportValue) {
  const reportValueNormalized = typeof reportValue === 'string'
    ? inspectStyleModuleSource(reportValue)
    : reportValue;
  if (!reportValueNormalized?.ok) {
    throw new Error(`Style memory contract failed: ${reportValueNormalized?.violations?.[0] ?? 'invalid-report'}`);
  }
  return reportValueNormalized;
}
