import { TerminalCursorCadence } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalCursorCadence';
import { TerminalIndicatorCadence } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalIndicatorCadence';
import { TerminalPanelTransit } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalPanelTransit';
import { TerminalScanlineCadence } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalScanlineCadence';
import { TerminalTextCadence } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalTextCadence';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { TerminalCursor, TerminalIndicator } from '@cut3/agent-memory/units/blue-terminal/TerminalAffordances';
import { TerminalCrtPanel } from '@cut3/agent-memory/units/blue-terminal/TerminalCrtPanel';
import { TerminalSpeakerPanel } from '@cut3/agent-memory/units/blue-terminal/TerminalSpeakerPanel';
import { TerminalStatusPanel } from '@cut3/agent-memory/units/blue-terminal/TerminalStatusPanel';

/** Plain runtime-copy application for either authored CRT contract. */
export function terminalCrtPanel(text, label, recipe, cursorGlyph, indicatorGlyph) {
  const message = new Text(text);
  const runtimeLabel = new Text(label);
  const cursorTarget = new TerminalCursor(cursorGlyph, recipe);
  const indicatorTarget = new TerminalIndicator(indicatorGlyph, recipe);
  const unit = new TerminalCrtPanel(
    message,
    runtimeLabel,
    cursorTarget,
    indicatorTarget,
    recipe,
  );
  const transits = unit.transitTargets.map((target) => new TerminalPanelTransit(target));
  const cadence = new TerminalTextCadence(message);
  const cursor = new TerminalCursorCadence(unit.cursor, recipe, message.text.length);
  const indicator = new TerminalIndicatorCadence(unit.indicator, recipe, message.text.length);
  const scanlines = new TerminalScanlineCadence(unit.scanlines, recipe);

  transits.forEach((transit) => transit.unit.addBehaviour(transit));
  message.addBehaviour(cadence);
  unit.cursor.addBehaviour(cursor);
  unit.indicator.addBehaviour(indicator);
  unit.scanlines.addBehaviour(scanlines);

  return unit;
}

/** Plain runtime-copy application for either authored speaker contract. */
export function terminalSpeakerPanel(text, label, recipe, cursorGlyph, indicatorGlyph) {
  const message = new Text(text);
  const runtimeLabel = new Text(label);
  const cursorTarget = new TerminalCursor(cursorGlyph, recipe);
  const indicatorTarget = new TerminalIndicator(indicatorGlyph, recipe);
  const unit = new TerminalSpeakerPanel(
    message,
    runtimeLabel,
    cursorTarget,
    indicatorTarget,
    recipe,
  );
  const transits = unit.transitTargets.map((target) => new TerminalPanelTransit(target));
  const cadence = new TerminalTextCadence(message);
  const cursor = new TerminalCursorCadence(unit.cursor, recipe, message.text.length);
  const indicator = new TerminalIndicatorCadence(unit.indicator, recipe, message.text.length);
  const scanlines = new TerminalScanlineCadence(unit.scanlines, recipe);

  transits.forEach((transit) => transit.unit.addBehaviour(transit));
  message.addBehaviour(cadence);
  unit.cursor.addBehaviour(cursor);
  unit.indicator.addBehaviour(indicator);
  unit.scanlines.addBehaviour(scanlines);

  return unit;
}

/** Plain runtime-copy application for either authored status contract. */
export function terminalStatusPanel(text, label, recipe, cursorGlyph, indicatorGlyph) {
  const message = new Text(text);
  const runtimeLabel = new Text(label);
  const cursorTarget = new TerminalCursor(cursorGlyph, recipe);
  const indicatorTarget = new TerminalIndicator(indicatorGlyph, recipe);
  const unit = new TerminalStatusPanel(
    message,
    runtimeLabel,
    cursorTarget,
    indicatorTarget,
    recipe,
  );
  const transits = unit.transitTargets.map((target) => new TerminalPanelTransit(target));
  const cadence = new TerminalTextCadence(message);
  const cursor = new TerminalCursorCadence(unit.cursor, recipe, message.text.length);
  const indicator = new TerminalIndicatorCadence(unit.indicator, recipe, message.text.length);
  const scanlines = new TerminalScanlineCadence(unit.scanlines, recipe);

  transits.forEach((transit) => transit.unit.addBehaviour(transit));
  message.addBehaviour(cadence);
  unit.cursor.addBehaviour(cursor);
  unit.indicator.addBehaviour(indicator);
  unit.scanlines.addBehaviour(scanlines);

  return unit;
}
