import { PortalSceneReveal } from '@cut3/agent-memory/behaviours/retro-ritual/PortalSceneReveal';
import { PortalTileStutter } from '@cut3/agent-memory/behaviours/retro-ritual/PortalTileStutter';
import { PortalTileTransition } from '@cut3/agent-memory/units/retro-ritual/PortalTileTransition';

/** Plain application output for the coordinated portal mosaic handoff. */
export function portalTileTransition(incomingScene) {
  const unit = new PortalTileTransition(incomingScene);
  const { incoming, portal } = unit.animationTargets();
  const reveal = new PortalSceneReveal(incoming);
  const stutter = new PortalTileStutter(portal);

  incoming.addBehaviour(reveal);
  portal.addBehaviour(stutter);

  return unit;
}
