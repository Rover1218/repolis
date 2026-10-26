import { formatOneCommit } from '@/lib/city/format';
import { ActivityStrip } from './ActivityStrip';
import styles from './city.module.css';

export interface PlayerProps {
  index: number;
  count: number;
  playing: boolean;
  readout: string;
  activity: Float32Array;
  onSeek: (index: number) => void;
  onTogglePlay: () => void;
}

/** Status lines replace the player: history progress, a history error, or a one-commit repo. */
export type TimelineProps = { progress: number } | { message: string } | { oneCommit: string } | PlayerProps;

function StatusLine({ text, live }: { text: string; live?: boolean }) {
  return (
    <section className={`${styles.panel} ${styles.timeline} ${styles.statusOnly}`} aria-label="Timeline">
      <p className={styles.statusText} role={live ? 'status' : undefined}>
        {text}
      </p>
    </section>
  );
}

/** "Mar 2019 · commit 1,204 · 224 files" with the date in bold, as in the prototype. */
function Readout({ text }: { text: string }) {
  const [date, ...rest] = text.split(' · ');
  return (
    <output className={styles.stamp}>
      <b>{date}</b>
      {rest.length > 0 && ` · ${rest.join(' · ')}`}
    </output>
  );
}

function Player({ index, count, playing, readout, activity, onSeek, onTogglePlay }: PlayerProps) {
  return (
    <section className={`${styles.panel} ${styles.timeline}`} aria-label="Timeline">
      <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className={styles.track}>
        <ActivityStrip activity={activity} index={index} />
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={count - 1}
          step={1}
          value={index}
          aria-label="Snapshot"
          aria-valuetext={readout}
          onChange={(e) => onSeek(Number(e.currentTarget.value))}
        />
      </div>
      <Readout text={readout} />
    </section>
  );
}

export function Timeline(props: TimelineProps) {
  if ('progress' in props) return <StatusLine text={`Fetching history… ${Math.round(props.progress * 100)}%`} />;
  if ('message' in props) return <StatusLine text={props.message} live />;
  if ('oneCommit' in props) return <StatusLine text={formatOneCommit(props.oneCommit)} />;
  return <Player {...props} />;
}
