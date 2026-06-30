import { useEffect } from 'react';
import type { Task, Subject, Status } from '../types';
import { STATUSES } from '../types';
import './StatusDetail.css';

interface Props {
  task: Task;
  subject: Subject | undefined;
  // Called with the new status when the user taps a circle in the
  // 2x2 grid. The dashboard wires this to a useTasks updateTask call
  // and closes the detail view; we just hand the new value up.
  onChange: (status: Status) => void;
  onClose: () => void;
}

export function StatusDetail({ task, subject, onChange, onClose }: Props) {
  // Close on Escape, like TaskModal. Mobile doesn't have an Escape
  // key, but desktop power users do — same code path keeps the
  // component's contract consistent.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Build the same smart due-date label the TaskCard uses, so the
  // meta line at the bottom of the picker matches what the user
  // saw on the card. Kept inline (not imported) to avoid a circular
  // import — the formatting is short enough to duplicate.
  function formatDue(): string {
    if (!task.due_date) return '';
    const d = new Date(task.due_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ms = d.getTime() - today.getTime();
    const dayMs = 86_400_000;
    let label: string;
    if (ms === 0) label = 'Today';
    else if (ms === dayMs) label = 'Tomorrow';
    else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (!task.due_time) return label;
    const [hh = '0', mm = '00'] = task.due_time.split(':');
    const hour = Number(hh);
    const minute = Number(mm);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${label} ${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  }
  const dueLabel = formatDue();

  function handlePick(next: Status) {
    if (next === task.status) {
      // Tapping the current status is a no-op; we close the picker
      // so the user can back out without committing a change.
      onClose();
      return;
    }
    // Close first, then fire the update. The dashboard's updateTask
    // is fire-and-forget from the picker's perspective — the toast
    // surfaces any failure, and the user has already moved on.
    onChange(next);
    onClose();
  }

  const currentMeta = STATUSES.find((s) => s.id === task.status) ?? STATUSES[0];

  return (
    <div
      className="status-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-detail-title"
      onClick={(e) => {
        // Backdrop click closes — mirrors TaskModal. The picker card
        // is the only child, so e.target === e.currentTarget is true
        // when the user taps outside it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="status-detail">
        <header className="status-detail-header">
          <button
            type="button"
            className="status-detail-back"
            onClick={onClose}
            aria-label="Close status picker"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
          <h2 id="status-detail-title" className="status-detail-task-title">
            {task.title}
          </h2>
          <p className="status-detail-current">
            <span
              className={`status-detail-current-dot status-dot--${task.status}`}
              aria-hidden="true"
            />
            {currentMeta.label}
          </p>
        </header>

        <div className="status-detail-grid">
          {STATUSES.map((s) => {
            const isCurrent = s.id === task.status;
            return (
              <button
                key={s.id}
                type="button"
                // `is-current` drives the filled-vs-outlined visual via
                // CSS. The circle color is from the same .status-dot--*
                // modifier used on the card, so a single source of
                // truth for palette.
                className={`status-pick${isCurrent ? ' is-current' : ''}`}
                onClick={() => handlePick(s.id)}
                aria-label={isCurrent ? `${s.label} (current)` : `Set status to ${s.label}`}
                aria-pressed={isCurrent}
              >
                <span
                  className={`status-pick-circle status-dot--${s.id}`}
                  aria-hidden="true"
                />
                <span className="status-pick-label">{s.label}</span>
              </button>
            );
          })}
        </div>

        {(subject || dueLabel) && (
          <p className="status-detail-meta">
            {subject && (
              <>
                <span
                  className="subject-dot"
                  style={{ backgroundColor: subject.color ?? 'var(--muted)' }}
                  aria-hidden="true"
                />
                <span>{subject.name}</span>
                {dueLabel && <span className="status-detail-sep" aria-hidden="true"> · </span>}
              </>
            )}
            {dueLabel && <span>{dueLabel}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
