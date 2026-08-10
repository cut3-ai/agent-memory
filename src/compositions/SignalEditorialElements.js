import { EditorialImpactSettle } from '@cut3/agent-memory/behaviours/signal-editorial/EditorialImpactSettle';
import { InkRuleStrike } from '@cut3/agent-memory/behaviours/signal-editorial/InkRuleStrike';
import { RazorCutSweep } from '@cut3/agent-memory/behaviours/signal-editorial/RazorCutSweep';
import { SignalSceneReveal } from '@cut3/agent-memory/behaviours/signal-editorial/SignalSceneReveal';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { SignalHeadlineBand } from '@cut3/agent-memory/units/signal-editorial/SignalHeadlineBand';
import { SignalMediaPlate } from '@cut3/agent-memory/units/signal-editorial/SignalMediaPlate';
import { SignalRazorTransition } from '@cut3/agent-memory/units/signal-editorial/SignalRazorTransition';

/** Plain application output for the authored headline and ink-rule entrance. */
export function signalHeadlineBand(text) {
  const unit = new SignalHeadlineBand(new Text(text));
  const { impact, rule } = unit.animationTargets();
  const settle = new EditorialImpactSettle(impact);
  const strike = new InkRuleStrike(rule);

  impact.addBehaviour(settle);
  rule.addBehaviour(strike);

  return unit;
}

/** Plain application output for the authored high-contrast media entrance. */
export function signalMediaPlate(media) {
  const unit = new SignalMediaPlate(media);
  const { impact } = unit.animationTargets();
  const settle = new EditorialImpactSettle(impact);

  impact.addBehaviour(settle);

  return unit;
}

/** Plain application output for the coordinated incoming reveal and razor sweep. */
export function signalRazorTransition(incomingScene) {
  const unit = new SignalRazorTransition(incomingScene);
  const { incoming, sweep } = unit.animationTargets();
  const reveal = new SignalSceneReveal(incoming);
  const razor = new RazorCutSweep(sweep);

  incoming.addBehaviour(reveal);
  sweep.addBehaviour(razor);

  return unit;
}
