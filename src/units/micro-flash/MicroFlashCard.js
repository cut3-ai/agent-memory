import { Unit } from '@cut3/agent-memory/core/Unit';

const CAPABILITY = Object.freeze({
  contract: 'micro-flash-card/v1',
  kind: 'native-dom',
});

/** Static native-style state for the authored seven-frame exposure pulse. */
export class MicroFlashCard extends Unit {
  static kind = 'unit.micro-flash.card';

  constructor() {
    super();
    this.capability = CAPABILITY;
    this.name = 'micro-flash-card';
    this.present = true;
    this.style = {
      background: 'transparent',
      inset: 0,
      opacity: 0,
      position: 'absolute',
    };
  }
}

/** Family-local native adapter: projected style passes to React without compilation. */
export function renderMicroFlashCard(React, state) {
  if (!React || typeof React.createElement !== 'function') {
    throw new TypeError('renderMicroFlashCard requires React.createElement');
  }
  if (!state || state.capability?.contract !== CAPABILITY.contract) {
    throw new TypeError('renderMicroFlashCard requires projected MicroFlashCard state');
  }
  return React.createElement('div', {
    'aria-hidden': true,
    'data-memory-unit': MicroFlashCard.kind,
    style: state.style,
  });
}

/** Ready-to-inject host registry for the family-local native DOM adapter. */
export const microFlashUnitRenderers = Object.freeze({
  [MicroFlashCard.kind]: ({ React, state }) => renderMicroFlashCard(React, state),
});
