import { describe, expect, it } from 'vitest';
import { createKeyboard } from '../src/input.js';
import type { KeyboardTarget, KeyEventLike } from '../src/input-dom.js';
import { wireKeyboard, type WireKeyboardGame } from '../src/wire-keyboard.js';
import type { Intent } from '../src/types.js';

/** Minimal `KeyboardTarget` that counts listeners and fires `keydown`/`blur`/`visibilitychange`. */
function fakeTarget() {
  const keyListeners = new Map<string, Set<(event: KeyEventLike) => void>>();
  const plainListeners = new Map<string, Set<() => void>>();
  const listenersOf = <T>(map: Map<string, Set<T>>, type: string): Set<T> => {
    let set = map.get(type);
    if (set === undefined) {
      set = new Set();
      map.set(type, set);
    }
    return set;
  };
  const doc = {
    visibilityState: 'visible',
    addEventListener(type: 'visibilitychange', listener: () => void) {
      listenersOf(plainListeners, type).add(listener);
    },
    removeEventListener(type: 'visibilitychange', listener: () => void) {
      listenersOf(plainListeners, type).delete(listener);
    },
  };
  const target: KeyboardTarget = {
    addEventListener(type: string, listener: (event: KeyEventLike) => void) {
      listenersOf(type === 'blur' ? plainListeners : keyListeners, type).add(
        listener,
      );
    },
    removeEventListener(type: string, listener: (event: KeyEventLike) => void) {
      listenersOf(type === 'blur' ? plainListeners : keyListeners, type).delete(
        listener,
      );
    },
    document: doc,
  };
  const press = (code: string): void => {
    const event = {
      code,
      repeat: false,
      defaultPrevented: false,
      preventDefault() {
        event.defaultPrevented = true;
      },
    };
    for (const listener of listenersOf(keyListeners, 'keydown')) listener(event);
  };
  const count = (): number =>
    [...keyListeners.values(), ...plainListeners.values()].reduce(
      (n, set) => n + set.size,
      0,
    );
  return { target, press, count };
}

/** A fake game: records dispatched intents, exposes a trigger for `restart`. */
function fakeGame(): {
  game: WireKeyboardGame;
  intents: Intent[];
  emitRestart: () => void;
  restartHandlers: () => number;
} {
  const intents: Intent[] = [];
  const handlers = new Set<() => void>();
  const game: WireKeyboardGame = {
    dispatch(intent) {
      intents.push(intent);
    },
    on(_type, handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
  const emitRestart = (): void => {
    for (const handler of handlers) handler();
  };
  return { game, intents, emitRestart, restartHandlers: () => handlers.size };
}

describe('wireKeyboard', () => {
  it('attaches exactly four window-level listeners, regardless of restart count', () => {
    const target = fakeTarget();
    const { game, emitRestart } = fakeGame();

    wireKeyboard(target.target, game, createKeyboard());

    expect(target.count()).toBe(4);
    emitRestart();
    emitRestart();
    emitRestart();
    // One keydown, one keyup, one blur, one visibilitychange — not twelve.
    expect(target.count()).toBe(4);
  });

  it('resets the keyboard on restart so a key still held fires again next run', () => {
    const target = fakeTarget();
    const { game, intents, emitRestart } = fakeGame();
    const keyboard = createKeyboard();

    wireKeyboard(target.target, game, keyboard);

    target.press('Space');
    // Still held: a repeat keydown without a keyup produces no intent.
    target.press('Space');
    expect(intents).toEqual(['primary']);

    emitRestart();

    // After restart, the held key counts as released; a fresh press fires.
    target.press('Space');
    expect(intents).toEqual(['primary', 'primary']);
  });

  it('dispose() removes every listener and the restart subscription', () => {
    const target = fakeTarget();
    const { game, emitRestart, restartHandlers, intents } = fakeGame();
    const keyboard = createKeyboard();

    const handle = wireKeyboard(target.target, game, keyboard);
    expect(target.count()).toBe(4);
    expect(restartHandlers()).toBe(1);

    handle.dispose();

    expect(target.count()).toBe(0);
    expect(restartHandlers()).toBe(0);

    // Hold a key before pressing — the reducer sees a held Space the first
    // time; without reset-on-restart it will not fire again.
    target.press('Space');
    emitRestart();
    target.press('Space');
    // No listeners left, so nothing was dispatched by the second press.
    expect(intents).toEqual([]);
  });
});
