import { STYLE_MEMORY_CONTRACT_VERSION, STYLE_SCENT_KEYS } from './style-contract.js';

/**
 * Stable instruction for the generation agent. It describes what memory is;
 * outcome policy and code validation remain deterministic outside the model.
 */
export function styleMemoryAgentInstruction() {
  return [
    `Style memory contract: ${STYLE_MEMORY_CONTRACT_VERSION}.`,
    'Before writing a composition, call retrieveStyleMemories(index, requestedScent) over index.generated.json; choose from its exact matched and missing cues, never from an invented scalar score.',
    'When a scent matches, import only that exact class with a static ESM import and adapt semantic content; preserve its layout, typography, palette, rendering treatment, and motion grammar.',
    'A memory is a concrete direct Unit subclass with a locked internal Unit tree, or a concrete direct Behaviour subclass with one authored nonlinear frame law and one visual channel.',
    'Never save a class that forwards CSS, appearance, props, a signal, a callback, a renderer, a factory, or an external library.',
    'A Unit memory accepts one semantic Unit slot exactly once. Build a branching tree with at least five internal Units, depth four, one parent per node, and authored visual constants in the class. Do not flatten the tree.',
    'For authored vector drawing, compose VectorPath leaves from literal numeric segment objects. Never save an SVG path string, drawing callback, or external vector-library wrapper.',
    'Use CompositionPivot with literal composition-space x/y for authored pivots. Never encode a memory pivot as CSS transformOrigin.',
    'A Behaviour memory accepts its owner Unit only and is attached as owner.add(new Behaviour(owner)). Do not combine fade, scale, translation, rotation, or other channels; transform and filter writes use the canonical shared helpers.',
    'The scent is controlled navigation metadata, not a prompt summary. Use exactly these keys: '
      + STYLE_SCENT_KEYS.join(', ') + '. Every cue is a lowercase kebab-case token.',
    'Every scent cue must exactly match a descriptor deterministically derived from the class source. Treat the evidence fingerprint and cue-evidence hash as the source-to-scent binding; never invent a cue that the contract cannot derive.',
    'Empty strings, zero values, transparent colors, none, auto, normal, static, inherited values, and other CSS defaults or no-ops are not authored style decisions.',
    'For a standalone Behaviour scent, composition, typography, palette, and rendering are empty arrays; motion contains only the derived motion grammar. A Unit scent covers all five axes and may inherit motion evidence only from a recursively verified attached Behaviour.',
    'Create a new candidate only after the exact generated revision has compile and render receipts plus a qualified workspace outcome such as accepted, exported, continued-unchanged, or reused.',
    'Correction, regeneration, manual edit, revert, delete, compile failure, or render failure rejects that revision. Silence, preview, autosave, topic change, and session close never approve it.',
    'Save the reusable art direction, not the scene narrative: new semantic content should look designed by the same author without recreating the same video.',
  ].join('\n');
}

export const STYLE_MEMORY_AGENT_INSTRUCTION = styleMemoryAgentInstruction();
