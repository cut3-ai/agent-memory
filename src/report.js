export function buildReportData(run) {
  const kinds = countBy(run.candidates, (candidate) => candidate.kind);
  const eligibility = countBy(run.candidates, (candidate) => (
    candidate.eligibility.evidenceReady ? 'evidence-ready' : 'inventory'
  ));
  return {
    schemaVersion: 2,
    runId: run.runId,
    verdict: {
      humanFeedbackAvailable: false,
      promotionAllowed: false,
      summary: 'The run located connected styled subtrees and bounded single-channel stylistic timing laws. Raw visual channels are infrastructure and no candidate can be promoted without emitted code, reconstruction and feedback.',
    },
    counts: run.manifest.counts,
    candidateEligibility: eligibility,
    candidateKinds: kinds,
    topCandidates: run.candidates.slice(0, 20).map((candidate) => ({
      id: candidate.id,
      family: candidate.family,
      kind: candidate.kind,
      evidenceReady: candidate.eligibility.evidenceReady,
      promotionEligible: candidate.eligibility.promotionEligible,
      blockers: candidate.eligibility.blockers,
      observations: candidate.evidence.observations,
      occurrences: candidate.evidence.occurrences,
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
    '> В датасете нет human feedback. Miner публикует только проверяемые evidence, eligibility и blockers — без субъективных оценок.',
    '',
    '> Unit candidate — только связное стилизованное JSX-поддерево. Behaviour candidate — только нетривиальный одноканальный temporal law (spring/oscillation/non-monotonic staged curve). Сам CSS-канал остаётся infrastructure.',
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
    '- `unit` — один локализованный connected styled JSX subtree, а не CSS property или host-element wrapper.',
    '- `behaviour` — один стилистически характерный temporal law, который позже принимает Unit; он всегда пишет ровно в один канал.',
    '- Atomic opacity/scale/translate/rotate сохраняются раздельно как infrastructure evidence; линейная запись сама по себе не является памятью.',
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
    '| Candidate | Family | Evidence ready | Obs | Occurrences | Independent | Sources | WS | Blockers |',
    '|---|---|---|---:|---:|---:|---:|---:|---|',
  ];
  for (const candidate of candidates) {
    rows.push(`| \`${escapeCell(candidate.id)}\` | ${escapeCell(candidate.family)} | ${candidate.eligibility.evidenceReady} | ${candidate.evidence.observations} | ${candidate.evidence.occurrences} | ${candidate.evidence.independentOccurrences} | ${candidate.evidence.uniqueSources} | ${candidate.evidence.workspaces} | ${escapeCell(candidate.eligibility.blockers.join(', '))} |`);
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
