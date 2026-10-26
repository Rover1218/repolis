// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneInput, type InputHandlers } from './input';

function setup() {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const handlers: InputHandlers = { onPointerDown: vi.fn(), onPick: vi.fn(), onEscape: vi.fn() };
  const input = new SceneInput(canvas, handlers);
  return { canvas, handlers, input };
}

const key = (type: 'keydown' | 'keyup', k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent(type, { key: k, ...init }));

function touchUp(canvas: HTMLCanvasElement, x: number, y: number) {
  const e = new MouseEvent('pointerup', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, 'pointerType', { value: 'touch' });
  canvas.dispatchEvent(e);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('SceneInput keys', () => {
  it('tracks held keys lower-cased and releases them', () => {
    const { input } = setup();
    key('keydown', 'W');
    key('keydown', 'a');
    expect([...input.keys].sort()).toEqual(['a', 'w']);
    key('keyup', 'w');
    expect([...input.keys]).toEqual(['a']);
  });

  it('ignores typing in text fields but still honours releases there', () => {
    const { input } = setup();
    const field = document.createElement('input');
    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(input.keys.size).toBe(0);
    key('keydown', 'w');
    field.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true }));
    expect(input.keys.size).toBe(0);
  });

  it('ignores modifier chords and key-less events', () => {
    const { input } = setup();
    key('keydown', 's', { ctrlKey: true });
    key('keydown', 's', { metaKey: true });
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(input.keys.size).toBe(0);
  });

  it('calls onEscape and clears keys on window blur', () => {
    const { handlers, input } = setup();
    key('keydown', 'Escape');
    expect(handlers.onEscape).toHaveBeenCalledOnce();
    key('keydown', 'w');
    window.dispatchEvent(new Event('blur'));
    expect(input.keys.size).toBe(0);
  });
});

describe('SceneInput pointer', () => {
  it('tracks the pointer, dragging and leaving', () => {
    const { canvas, handlers, input } = setup();
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 20 }));
    expect(input.pointer).toMatchObject({ clientX: 10, clientY: 20, inside: true });
    expect(input.consumeMoved()).toBe(true);
    expect(input.consumeMoved()).toBe(false);
    canvas.dispatchEvent(new MouseEvent('pointerdown'));
    expect(input.pointer.dragging).toBe(true);
    expect(handlers.onPointerDown).toHaveBeenCalledOnce();
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(input.pointer.dragging).toBe(false);
    canvas.dispatchEvent(new MouseEvent('pointerleave'));
    expect(input.pointer.inside).toBe(false);
  });

  it('picks on double-click and on a touch double-tap only', () => {
    const { canvas, handlers } = setup();
    canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: 5, clientY: 5 }));
    expect(handlers.onPick).toHaveBeenCalledTimes(1);
    touchUp(canvas, 100, 100);
    expect(handlers.onPick).toHaveBeenCalledTimes(1);
    touchUp(canvas, 104, 102);
    expect(handlers.onPick).toHaveBeenCalledTimes(2);
    touchUp(canvas, 104, 102);
    expect(handlers.onPick).toHaveBeenCalledTimes(2);
  });

  it('a mouse pointerup never counts as a tap', () => {
    const { canvas, handlers } = setup();
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 1, clientY: 1 }));
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 1, clientY: 1 }));
    expect(handlers.onPick).not.toHaveBeenCalled();
  });
});

describe('SceneInput dispose', () => {
  it('removes every listener', () => {
    const { canvas, handlers, input } = setup();
    input.dispose();
    key('keydown', 'w');
    key('keydown', 'Escape');
    canvas.dispatchEvent(new MouseEvent('pointerdown'));
    canvas.dispatchEvent(new MouseEvent('dblclick'));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 3, clientY: 3 }));
    expect(input.keys.size).toBe(0);
    expect(handlers.onEscape).not.toHaveBeenCalled();
    expect(handlers.onPointerDown).not.toHaveBeenCalled();
    expect(handlers.onPick).not.toHaveBeenCalled();
    expect(input.pointer.inside).toBe(false);
  });
});
