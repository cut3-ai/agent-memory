import { RankingCard } from '../../../../units/ranking-card.js';
import { visualStyle } from '../style.js';

export function renderRankingCard(context) {
  if (!(context.unit instanceof RankingCard)) return context.unhandled;
  return context.React.createElement(context.component('rankingCard', 'div'), {
    style: visualStyle(context.state),
  }, ...context.renderChildren());
}
