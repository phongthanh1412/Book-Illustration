import { Fragment } from 'react';
import { STEP_KEYS, statusIndex, type ProjectStatus } from '../lib/types';
import { STEP_LABELS } from '../lib/projectDisplay';

export function Stepper({ status }: { status: ProjectStatus }) {
  const idx = statusIndex(status);
  return (
    <div className="stepper" role="list" aria-label="Pipeline progress">
      {STEP_KEYS.map((key, i) => {
        const done = i < idx;
        const current = i === idx;
        const cls = done ? 'done' : current ? 'current' : 'pending';
        return (
          <Fragment key={key}>
            <div className={`step ${cls}`} role="listitem" aria-current={current ? 'step' : undefined}>
              <span className={`gd-num-square ${done ? 'done' : current ? '' : 'gray'}`}>{done ? '✓' : i + 1}</span>
              <span className="lbl">{STEP_LABELS[key]}</span>
            </div>
            {i < STEP_KEYS.length - 1 && <div className={`connector ${i < idx ? 'done' : ''}`} />}
          </Fragment>
        );
      })}
    </div>
  );
}
