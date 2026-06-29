import type { MouseEvent, KeyboardEvent, CSSProperties } from 'react';
import type { Task, Subject } from '../types';
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
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  // Compare on the date only, not the time of day.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return due < today;
}

function formatDate(dueDate: string | null): string {
  if (!dueDate) return '';
  const d = new Date(dueDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TaskCard({
  task,
  subject,
  onToggleComplete,
  onClick,
  onDelete,
  isBusy = false,
  dragDisabled = false,
}: Props) {
  const overdue = !task.completed_at && isOverdue(task.due_date);

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
        </span>

        {(task.description || task.due_date) && (
          <span className="task-meta">
            {task.due_date && (
              <span className={`due-chip${overdue ? ' is-overdue' : ''}`}>
                {formatDate(task.due_date)}
              </span>
            )}
            {task.description && (
              <span className="task-description">{task.description}</span>
            )}
          </span>
        )}
      </div>

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