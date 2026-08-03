export function buildReportData(run) {
  const maturity = countBy(run.candidates, (candidate) => candidate.maturity);
  const kinds = countBy(run.candidates, (candidate) => candidate.kind);
  return {
    schemaVersion: 1,
    runId: run.runId,
    verdict: {
      humanFeedbackAvailable: false,
      promotionAllowed: false,
      summary: 'The run located atomic visual patterns, but cannot prove success without human feedback or a compilable dependency closure.',
    },
    counts: run.manifest.counts,
    candidateMaturity: maturity,
    candidateKinds: kinds,
    topCandidates: run.candidates.slice(0, 20).map((candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      maturity: candidate.maturity,
      score: candidate.confidence.score,
      observations: candidate.evidence.observations,
      independentOccurrences: candidate.evidence.independentOccurrences,
      uniqueSources: candidate.evidence.uniqueSources,
      workspaces: candidate.evidence.workspaces,
    })),
    exactDuplicateGroups: run.exactGroups.filter((group) => group.occurrences > 1),
    structuralDuplicateGroups: run.structuralGroups.filter((group) => group.uniqueSources > 1),
    compositionClusters: run.compositionClusters,
    timelineArrangements: run.timelineArrangements,
  };
}

export function renderMarkdownReport(run) {
  const { counts } = run.manifest;
  const sections = [
    '# Memory miner — отчёт эксперимента',
    '',
    `Run ID: \`${run.runId}\`  `,
    `Алгоритм: \`${run.manifest.algorithmVersion}\`  `,
    `Порог complete-link clustering: \`${run.manifest.config.clusterThreshold}\``,
    '',
    '> В датасете нет human feedback. `strong` означает сильное доказательство повторяемости/извлекаемости, а не успешность или визуальное качество. Все entries остаются `suggested`, `feedback: unknown`, `trusted: false`.',
    '',
    '> Miner локализует visual sink и AST spans (`atomic-occurrences-located`), но ещё не собирает компилируемый dependency closure. Поэтому ни один candidate не может попасть в production автоматически.',
    '',
    '## Корпус',
    '',
    '| Метрика | Значение |',
    '|---|---:|',
    `| JSONL workspaces | ${counts.workspaces} |`,
    `| Workspaces с composition | ${counts.workspacesWithCompositions} |`,
    `| Все tracks | ${counts.tracks} |`,
    `| Composition observations | ${counts.observations} |`,
    `| Валидный AST | ${counts.validSources} |`,
    `| Ошибки parse | ${counts.invalidSources} |`,
    `| Уникальные exact sources | ${counts.uniqueSources} |`,
    `| Exact duplicate groups | ${counts.exactDuplicateGroups} |`,
    `| Structural duplicate groups | ${counts.structuralDuplicateGroups} |`,
    `| Near-code clusters | ${counts.compositionClusters} |`,
    `| Timeline arrangements (только диагностика) | ${counts.timelineArrangements} |`,
    '',
    '## Кандидаты для review',
    '',
    candidateTable(run.candidates),
    '',
    '## Повторяющийся код',
    '',
    structuralGroupTable(run.structuralGroups.filter((group) => group.uniqueSources > 1)),
    '',
    '## Near-code clusters',
    '',
    clusterTable(run.compositionClusters),
    '',
    '## Timeline arrangements — не элементы памяти',
    '',
    arrangementTable(run.timelineArrangements),
    '',
    '## Как читать результат',
    '',
    '- `unit` — один локализованный renderable JSX subtree.',
    '- `behavior` — один frame-driven visual channel конкретного JSX sink.',
    '- `clamp`, `lerp`, `msToFrames` и другие числовые helpers никогда не становятся memory entries.',
    '- Совместные opacity + scale дают два behavior, но не новый `fadeScale` класс.',
    '- Количество одинаковых карточек меняет evidence, а не identity модуля.',
    '- Timeline arrangements помогают найти evidence, но не входят в preview index.',
    '- Exact copies расширяют evidence, но не считаются новыми implementations.',
    '- DOM, Canvas, SVG и Three.js имеют hard gate и не объединяются в один code cluster.',
    '- Prompt не участвует в identity или detection; сырой prompt, transcript, source и URL не входят в preview index.',
    '- Текущий atom extractor покрывает DOM style sinks; SVG attributes, Canvas commands и Three props — следующий отдельный проход.',
    '',
    '## Gate перед внедрением',
    '',
    '1. Вручную проверить top-20: минимум 70% должны быть реально reusable.',
    '2. Проверить границы abstraction: один unit root или один behavior channel.',
    '3. Для выбранных кандидатов сделать typed API, dependency closure и compile/render tests.',
    '4. Только после review перенести entry в production `units/` или `behaviors/` и перестроить `index.generated.json`.',
    '',
  ];
  return sections.join('\n');
}

function candidateTable(candidates) {
  if (candidates.length === 0) return '_Кандидаты не найдены._';
  const rows = [
    '| Candidate | Kind | Tier | Score | Obs | Independent | Sources | WS |',
    '|---|---|---|---:|---:|---:|---:|---:|',
  ];
  for (const candidate of candidates) {
    rows.push(`| \`${escapeCell(candidate.id)}\` | ${candidate.kind} | ${candidate.confidence.tier} | ${candidate.confidence.score.toFixed(4)} | ${candidate.evidence.observations} | ${candidate.evidence.independentOccurrences} | ${candidate.evidence.uniqueSources} | ${candidate.evidence.workspaces} |`);
  }
  return rows.join('\n');
}

function structuralGroupTable(groups) {
  if (groups.length === 0) return '_Structural duplicates не найдены._';
  const rows = [
    '| Group | Occurrences | Sources | Workspaces | Lineages |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const group of groups) {
    rows.push(`| \`${group.id}\` | ${group.occurrences} | ${group.uniqueSources} | ${group.workspaces} | ${group.lineages} |`);
  }
  return rows.join('\n');
}

function clusterTable(clusters) {
  if (clusters.length === 0) return '_Near-code clusters не найдены при текущем пороге._';
  const rows = [
    '| Cluster | Backend | Sources | Min similarity | Median | Common signals |',
    '|---|---|---:|---:|---:|---|',
  ];
  for (const cluster of clusters) {
    rows.push(`| \`${cluster.id}\` | ${cluster.renderMode} | ${cluster.uniqueSources} | ${cluster.minimumSimilarity.toFixed(4)} | ${cluster.medianSimilarity.toFixed(4)} | ${escapeCell(cluster.commonSignals.join(', '))} |`);
  }
  return rows.join('\n');
}

function arrangementTable(arrangements) {
  if (arrangements.length === 0) return '_Timeline arrangements не найдены._';
  const rows = [
    '| Arrangement diagnostic | Workspaces | Evidence tracks | Why |',
    '|---|---:|---:|---|',
  ];
  for (const arrangement of arrangements) {
    rows.push(`| \`${arrangement.id}\` | ${arrangement.workspaceIndexes.length} | ${arrangement.evidenceObservationIds.length} | ${escapeCell(arrangement.why)} |`);
  }
  return rows.join('\n');
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function escapeCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
