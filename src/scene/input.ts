import { isDoubleTap, type TapSample } from './camera-rig';

export interface InputHandlers {
  /** Any press on the canvas (cancels a camera flight). */
  onPointerDown(): void;
  /** Double-click or touch double-tap, in canvas CSS pixels. */
  onPick(offsetX: number, offsetY: number): void;
  onEscape(): void;
}

export interface PointerState {
  clientX: number;
  clientY: number;
  /** Canvas-relative CSS pixels. */
  offsetX: number;
  offsetY: number;
  inside: boolean;
  dragging: boolean;
  /** Set on every move; cleared by `consumeMoved()`. */
  moved: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** DOM input wiring for the city canvas; everything is removed by `dispose()`. */
export class SceneInput {
  /** Lower-cased keys currently held. */
  readonly keys = new Set<string>();
  readonly pointer: PointerState = {
    clientX: 0,
    clientY: 0,
    offsetX: 0,
    offsetY: 0,
    inside: false,
    dragging: false,
    moved: false,
  };

  private readonly abort = new AbortController();
  private lastTap: TapSample | null = null;

  constructor(canvas: HTMLCanvasElement, private readonly handlers: InputHandlers) {
    const signal = this.abort.signal;
    // Capture so a press cancels a flight before OrbitControls sees it (controls are disabled mid-flight).
    canvas.addEventListener('pointerdown', this.onPointerDown, { signal, capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove, { signal });
    canvas.addEventListener('pointerleave', this.onPointerLeave, { signal });
    canvas.addEventListener('pointerup', this.onCanvasPointerUp, { signal });
    canvas.addEventListener('dblclick', this.onDoubleClick, { signal });
    const win = canvas.ownerDocument.defaultView;
    if (!win) return;
    win.addEventListener('pointerup', this.endDrag, { signal });
    win.addEventListener('pointercancel', this.endDrag, { signal });
    win.addEventListener('keydown', this.onKeyDown, { signal });
    win.addEventListener('keyup', this.onKeyUp, { signal });
    win.addEventListener('blur', this.clearKeys, { signal });
  }

  consumeMoved(): boolean {
    const moved = this.pointer.moved;
    this.pointer.moved = false;
    return moved;
  }

  dispose(): void {
    this.abort.abort();
    this.keys.clear();
    this.lastTap = null;
  }

  private readonly onPointerDown = (): void => {
    this.pointer.dragging = true;
    this.handlers.onPointerDown();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointer;
    p.clientX = e.clientX;
    p.clientY = e.clientY;
    p.offsetX = e.offsetX;
    p.offsetY = e.offsetY;
    p.inside = true;
    p.moved = true;
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.inside = false;
  };

  private readonly endDrag = (): void => {
    this.pointer.dragging = false;
  };

  private readonly onCanvasPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    const tap: TapSample = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (isDoubleTap(this.lastTap, tap)) {
      this.lastTap = null;
      this.handlers.onPick(e.offsetX, e.offsetY);
    } else {
      this.lastTap = tap;
    }
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    this.handlers.onPick(e.offsetX, e.offsetY);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Autofill can dispatch key events without a key; modifier chords are browser shortcuts.
    if (!e.key || isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      this.handlers.onEscape();
      return;
    }
    this.keys.add(e.key.toLowerCase());
  };

  // Releases are honoured everywhere so a key let go inside a text field never sticks.
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key) this.keys.delete(e.key.toLowerCase());
  };

  private readonly clearKeys = (): void => {
    this.keys.clear();
  };
}
