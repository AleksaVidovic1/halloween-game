// Wires the DOM keyboard adapter to a game once, and clears held keys at the
// start of each new run. The adapter must register `keydown` and `keyup` once
// per page (architecture 2.2 Input model); re-attaching on `restart` leaks
// listeners. `reset()` releases held keys without touching the DOM.

import { createKeyboard, type Keyboard } from './input.js';
import { attachKeyboard, type KeyboardTarget } from './input-dom.js';
import type { Intent } from './types.js';

/** The slice of `Game` that this wire-up needs — dispatch intents and listen for restart. */
export interface WireKeyboardGame {
  dispatch(intent: Intent): void;
  on(type: 'restart', handler: () => void): () => void;
}

/**
 * Attaches `keyboard` to `target` once and arranges for `keyboard.reset()` to
 * run on every `restart`, so a key still held through the dying frame does not
 * count as pressed in the next run. Returns `dispose()` for teardown.
 */
export function wireKeyboard(
  target: KeyboardTarget,
  game: WireKeyboardGame,
  keyboard: Keyboard = createKeyboard(),
): { dispose(): void } {
  const handle = attachKeyboard(target, keyboard, (intent) => {
    game.dispatch(intent);
  });
  const unsubscribe = game.on('restart', () => {
    keyboard.reset();
  });
  return {
    dispose() {
      handle.dispose();
      unsubscribe();
    },
  };
}
