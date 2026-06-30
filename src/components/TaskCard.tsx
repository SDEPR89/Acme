import type { MouseEvent, KeyboardEvent, CSSProperties } from 'react';
import type { Task, Subject } from '../types';
import { STATUSES } from '../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  task: Task;
  subject: Subject | undefined;
  onToggleComplete: () => void;
  onClick: () => void;
  onDelete: () => void;
  // True while a task operation (toggle-complete, delete, update) for
  // this card is mid-round-trip. Disable the destructive controls so a
  // fast double-click can't race two requests to the server.
  isBusy?: boolean;
  // While a reorder RPC is in flight this disables drag for every
  // card so a second drop can't race the first. Wired by Dashboard
  // via the useTasks `reorderBusy` flag.
  dragDisabled?: boolean;
  // Fires when the user taps/clicks the status circle (mobile only —
  // desktop passes a no-op so the dot stays a display indicator until
  // the user edits via the TaskModal). The StatusDetail full-page
  // picker is mounted from the dashboard in response to this.
  onOpenStatusDetail?: () => void;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  // Compare on the date only, not the time of day. Comparing with the
  // time would make a task due "today at 09:00" overdue at 09:01
  // today, which is technically correct but feels aggressive on the
  // morning of the due date. The chip lights up at 00:00 instead.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return due < today;
}

// Smart format for the due-date chip. `due_time` arrives as 'HH:MM:SS'
// from Postgres (or null). We always build a Date in the user's local
// timezone — Postgres' time-without-tz is implicitly local. The chip
// shows "Today" / "Tomorrow" / "Jun 30" when no time is set, or the
// same with the time appended when one is.
function formatDue(task: Task): string {
  if (!task.due_date) return '';
  const d = new Date(task.due_date + 'T00:00:00');
  // Use a fresh "today" so the day-boundary check uses the user's
  // local midnight. We rebuild instead of caching so a card that's
  // been on screen since yesterday correctly reports "Tomorrow" today.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ms = d.getTime() - today.getTime();
  const dayMs = 86_400_000;
  const isToday = ms === 0;
  const isTomorrow = ms === dayMs;

  let label: string;
  if (isToday) label = 'Today';
  else if (isTomorrow) label = 'Tomorrow';
  else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (!task.due_time) return label;
  // Parse 'HH:MM:SS' and reformat to the user's locale. We split on
  // ':' rather than constructing a Date because Date would apply the
  // local timezone, but we already know the time is in local terms
  // and want to render it verbatim. Slice to 'HH:MM' (drop seconds).
  const [hh = '0', mm = '00'] = task.due_time.split(':');
  const hour = Number(hh);
  const minute = Number(mm);
  // 12-hour with AM/PM. 'en-US' style for now — Date.toLocaleTimeString
  // would also work but it returns seconds and we'd have to trim.
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const time = `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
  return `${label} ${time}`;
}

export function TaskCard({
  task,
  subject,
  onToggleComplete,
  onClick,
  onDelete,
  isBusy = false,
  dragDisabled = false,
  onOpenStatusDetail,
}: Props) {
  const overdue = !task.completed_at && isOverdue(task.due_date);
  const dueLabel = formatDue(task);
  // Look up the current status's label once for the dot's aria-label.
  // The dot's color comes from a CSS modifier class on the element.
  const statusMeta = STATUSES.find((s) => s.id === task.status) ?? STATUSES[0];

  // dnd-kit sortable wiring. We spread `listeners` and `attributes`
  // on the card body (the inner <div role="button">) rather than the
  // <li> so the pointer sensor doesn't compete with the checkbox
  // and delete button siblings, which sit outside the body and use
  // stopPropagation. The KeyboardSensor reaches the same div because
  // we converted the native <button> to a div — Space/Enter is no
  // longer consumed by the platform button before dnd-kit sees it.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Promote to its own compositor layer only while this specific
    // card is being dragged — not for any other card. The
    // `.task-card.is-dragging { will-change: transform }` CSS rule
    // handles siblings, but the dragged card itself uses inline
    // style so dnd-kit's transform update lands on a layer the
    // compositor owns.
    ...(isDragging ? { willChange: 'transform' as const } : {}),
  };
  const className = `task-card${task.completed_at ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`;

  function handleDelete(e: MouseEvent) {
    // The card body is now a div-with-role-button; without stopping
    // the click here the delete button would also bubble up and open
    // the edit modal.
    e.stopPropagation();
    if (isBusy) return;
    onDelete();
  }

  function handleStatusDotClick(e: MouseEvent) {
    // Stop propagation so the card body doesn't also receive the
    // click and open the edit modal. Only relevant on mobile, where
    // the dot is tappable; on desktop `onOpenStatusDetail` is a no-op
    // and this handler still runs but does nothing.
    e.stopPropagation();
    if (isBusy) return;
    onOpenStatusDetail?.();
  }

  function handleBodyKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <li ref={setNodeRef} style={style} className={className}>
      <label className="task-check" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!task.completed_at}
          onChange={isBusy ? undefined : onToggleComplete}
          disabled={isBusy}
          aria-label={task.completed_at ? 'Mark as not done' : 'Mark as done'}
        />
      </label>

      {/*
        Card body: drag handle AND click-to-edit target. Listeners
        (pointer / keyboard) come from useSortable; the 8px activation
        distance in Dashboard's PointerSensor keeps stationary clicks
        falling through to this onClick. `attributes` already supplies
        role="button" / tabIndex / aria-roledescription — we don't
        re-set them here or TypeScript flags the duplicate.
       */}
      <div
        className="task-body"
        onClick={onClick}
        onKeyDown={handleBodyKeyDown}
        {...listeners}
        {...attributes}
      >
        <span className="task-title-row">
          {subject && (
            <span
              className="subject-dot"
              style={{ backgroundColor: subject.color ?? 'var(--muted)' }}
              aria-hidden="true"
            />
          )}
          <span className="task-title">{task.title}</span>
          {subject && (
            <span className="task-subject-name" title={subject.name}>
              {subject.name}
            </span>
          )}
        </span>

        {(task.description || task.due_date) && (
          <span className="task-meta">
            {task.due_date && (
              <span className={`due-chip${overdue ? ' is-overdue' : ''}`}>
                {dueLabel}
              </span>
            )}
            {task.description && (
              <span className="task-description">{task.description}</span>
            )}
          </span>
        )}
      </div>

      {/*
        Status dot — absolutely positioned at the bottom-left of the
        card so it doesn't fight the title row for space and so the
        eye reads it as a corner indicator. The wrapper is a <button>
        when `onOpenStatusDetail` is provided (mobile, where the dot
        is a 28px tap target) and a plain <span> otherwise (desktop,
        where the dot is a display-only indicator). The status colors
        come from a CSS modifier class so the light/dark themes can
        remap them via tokens without touching this file.
       */}
      {onOpenStatusDetail ? (
        <button
          type="button"
          className={`task-status-dot status-dot--${task.status}`}
          onClick={handleStatusDotClick}
          disabled={isBusy}
          aria-label={`Status: ${statusMeta.label}. Tap to change.`}
          title={statusMeta.label}
        />
      ) : (
        <span
          className={`task-status-dot status-dot--${task.status}`}
          aria-label={`Status: ${statusMeta.label}`}
          title={statusMeta.label}
        />
      )}

      <button
        type="button"
        className={`task-delete-btn${isBusy ? ' is-busy' : ''}`}
        aria-label={isBusy ? `Deleting ${task.title}` : `Delete ${task.title}`}
        title={isBusy ? 'Deleting…' : `Delete ${task.title}`}
        aria-busy={isBusy}
        onClick={handleDelete}
        disabled={isBusy}
      >
        {isBusy ? (
          <svg
            className="task-delete-spinner"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M21 12a9 9 0 0 1-9 9" />
          </svg>
        ) : (
          '×'
        )}
      </button>
    </li>
  );
}
