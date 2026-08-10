import assert from 'node:assert/strict';
import test from 'node:test';

import {
  casefileShutterTransition,
  dossierPhotoMount,
  dossierQuoteStrip,
} from '@cut3/agent-memory/compositions/ArchivalDossierElements';
import {
  portalTileTransition,
} from '@cut3/agent-memory/compositions/PortalTileHandoff';
import {
  signalHeadlineBand,
  signalMediaPlate,
  signalRazorTransition,
} from '@cut3/agent-memory/compositions/SignalEditorialElements';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { CasefileShutterTransition } from '@cut3/agent-memory/units/archival-dossier/CasefileShutterTransition';
import { DossierPhotoMount } from '@cut3/agent-memory/units/archival-dossier/DossierPhotoMount';
import { DossierQuoteStrip } from '@cut3/agent-memory/units/archival-dossier/DossierQuoteStrip';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { PortalTileTransition } from '@cut3/agent-memory/units/retro-ritual/PortalTileTransition';
import { SignalHeadlineBand } from '@cut3/agent-memory/units/signal-editorial/SignalHeadlineBand';
import { SignalMediaPlate } from '@cut3/agent-memory/units/signal-editorial/SignalMediaPlate';
import { SignalRazorTransition } from '@cut3/agent-memory/units/signal-editorial/SignalRazorTransition';

test('legacy semantic Units are static trees with zero hidden Behaviours', () => {
  const units = [
    new SignalHeadlineBand(new Text('HEADLINE')),
    new SignalMediaPlate(new Box()),
    new SignalRazorTransition(new Layer()),
    new DossierPhotoMount(new Box()),
    new DossierQuoteStrip(new Text('QUOTE')),
    new CasefileShutterTransition(new Layer()),
    new PortalTileTransition(new Layer()),
  ];

  for (const root of units) {
    visitUnits(root, (unit) => {
      assert.deepEqual(
        unit.behaviours,
        [],
        `${root.constructor.kind} must remain a static Unit tree`,
      );
    });
  }
});

test('application builders attach owner-first Behaviours to named semantic targets', () => {
  const cases = [
    [signalHeadlineBand('HEADLINE'), [
      'behaviour.signal-editorial.impact-settle',
      'behaviour.signal-editorial.ink-rule-strike',
    ]],
    [signalMediaPlate(new Box()), ['behaviour.signal-editorial.impact-settle']],
    [signalRazorTransition(new Layer()), [
      'behaviour.signal-editorial.scene-reveal',
      'behaviour.signal-editorial.razor-cut-sweep',
    ]],
    [dossierPhotoMount(new Box()), ['behaviour.archival-dossier.pinned-evidence-drop']],
    [dossierQuoteStrip('QUOTE'), ['behaviour.archival-dossier.carbon-copy-cadence']],
    [casefileShutterTransition(new Layer()), [
      'behaviour.archival-dossier.scene-reveal',
      'behaviour.archival-dossier.casefile-shutter-fall',
    ]],
    [portalTileTransition(new Layer()), [
      'behaviour.retro-ritual.portal-scene-reveal',
      'behaviour.retro-ritual.portal-tile-stutter',
    ]],
  ];

  for (const [root, expectedKinds] of cases) {
    const behaviours = [];
    visitUnits(root, (unit) => behaviours.push(...unit.behaviours));
    assert.deepEqual(
      behaviours.map((behaviour) => behaviour.constructor.kind),
      expectedKinds,
    );
    assert.ok(behaviours.every((behaviour) => behaviour.unit.behaviours.includes(behaviour)));
  }
});
