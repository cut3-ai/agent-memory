import { CarbonCopyCadence } from '@cut3/agent-memory/behaviours/archival-dossier/CarbonCopyCadence';
import { CasefileShutterFall } from '@cut3/agent-memory/behaviours/archival-dossier/CasefileShutterFall';
import { DossierSceneReveal } from '@cut3/agent-memory/behaviours/archival-dossier/DossierSceneReveal';
import { PinnedEvidenceDrop } from '@cut3/agent-memory/behaviours/archival-dossier/PinnedEvidenceDrop';
import { CasefileShutterTransition } from '@cut3/agent-memory/units/archival-dossier/CasefileShutterTransition';
import { DossierPhotoMount } from '@cut3/agent-memory/units/archival-dossier/DossierPhotoMount';
import { DossierQuoteStrip } from '@cut3/agent-memory/units/archival-dossier/DossierQuoteStrip';
import { Text } from '@cut3/agent-memory/units/base/Text';

/** Plain application output for the authored pinned evidence entrance. */
export function dossierPhotoMount(media) {
  const unit = new DossierPhotoMount(media);
  const { evidence } = unit.animationTargets();
  const drop = new PinnedEvidenceDrop(evidence);

  evidence.addBehaviour(drop);

  return unit;
}

/** Plain application output for the authored carbon-copy quote cadence. */
export function dossierQuoteStrip(text) {
  const unit = new DossierQuoteStrip(new Text(text));
  const { copy } = unit.animationTargets();
  const cadence = new CarbonCopyCadence(copy);

  copy.addBehaviour(cadence);

  return unit;
}

/** Plain application output for the coordinated case-file shutter handoff. */
export function casefileShutterTransition(incomingScene) {
  const unit = new CasefileShutterTransition(incomingScene);
  const { incoming, shutter } = unit.animationTargets();
  const reveal = new DossierSceneReveal(incoming);
  const fall = new CasefileShutterFall(shutter);

  incoming.addBehaviour(reveal);
  shutter.addBehaviour(fall);

  return unit;
}
