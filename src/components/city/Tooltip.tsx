import type { Ref } from 'react';
import type { TooltipInfo } from '@/lib/city/format';
import styles from './city.module.css';

const OFFSET = 16;
/** Within this distance of the right / bottom edge the tooltip opens to the other side. */
const FLIP_X = 320;
const FLIP_Y = 120;

/** Moves the tooltip next to the pointer (viewport px) without a React render. */
export function moveTooltip(el: HTMLElement | null, clientX: number, clientY: number): void {
  if (!el) return;
  const view = el.ownerDocument.defaultView;
  const flipX = view !== null && clientX > view.innerWidth - FLIP_X;
  const flipY = view !== null && clientY > view.innerHeight - FLIP_Y;
  const x = flipX ? `calc(${clientX - OFFSET}px - 100%)` : `${clientX + OFFSET}px`;
  const y = flipY ? `calc(${clientY - OFFSET}px - 100%)` : `${clientY + OFFSET}px`;
  el.style.transform = `translate(${x}, ${y})`;
}

interface TooltipProps {
  info: TooltipInfo | null;
  ref?: Ref<HTMLDivElement>;
}

/** Always mounted so the pointer position can be written to it before React re-renders. */
export function Tooltip({ info, ref }: TooltipProps) {
  return (
    <div ref={ref} className={styles.tip} role="tooltip" hidden={info === null}>
      {info && (
        <>
          <div className={styles.tipTitle}>{info.title}</div>
          {info.lines.map((line, i) => (
            <div key={i} className={styles.tipRow}>
              {line}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
