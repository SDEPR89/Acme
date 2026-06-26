import type { Quadrant as QuadrantId, Task, Subject } from '../types';
import { QUADRANTS } from '../types';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';

interface Props {
  id: QuadrantId;
  tasks: Task[];
  // Live mirror used as the dnd-kit source of truth. Diverges from
  // `tasks` only while a drag is in flight (the dashboard re-buckets
  // the dragged card into a different quadrant via setLiveTasks in
  // onDragOver). The SortableContext items array and TaskCard list
  // are read from here so dnd-kit can compute the dragged card's
  // transform correctly across containers. The count badge and the
  // empty-state check still read from `tasks` so realtime updates
  // reflect immediately even mid-drag.
  liveTasks: Task[];
  subjects: Subject[];
  onAdd: (quadrant: QuadrantId) => void;
  onToggleComplete: (task: Task) => void;
  onTaskClick: (task: Task) => void;
  onDelete: (task: Task) => void;
  // Hook-level predicate: returns true while an operation on the given
  // task id is mid-round-trip. Used to disable destructive card
  // controls during in-flight requests.
  isTaskBusy?: (taskId: string) => boolean;
  // While the reorder RPC is in flight we disable drag on every
  // card and drop target to prevent a second drop from racing the
  // first one. Wired by Dashboard via the useTasks `reorderBusy`
  // flag.
  reorderDisabled?: boolean;
}

export function Quadrant({
  id,
  tasks,
  liveTasks,
  subjects,
  onAdd,
  onToggleComplete,
  onTaskClick,
  onDelete,
  isTaskBusy,
  reorderDisabled = false,
}: Props) {
  const meta = QUADRANTS.find((q) => q.id === id)!;
  // `isEmpty` is driven by the live mirror so a cross-quadrant drop
  // into an empty quadrant renders the SortableContext / card list
  // mid-drag. The count badge still reads `tasks` (canonical), so
  // the header doesn't flicker while the user is hovering.
  const isEmpty = liveTasks.length === 0;

  // Two droppable surfaces share the same sentinel id
  // (`quadrant:<id>`) that `decodeDropTarget` in src/lib/reorder.ts
  // understands. Drops onto either append to the end of this
  // quadrant, so they merge into one logical target from dnd-kit's
  // point of view:
  //   - Empty quadrant: the whole <ul> is the droppable (the
  //     dashed "no tasks here yet" box).
  //   - Non-empty quadrant: a dedicated ~36px strip above the
  //     "+ Add task" button is the droppable. Without this strip,
  //     dnd-kit's closestCenter picks the closest sortable item
  //     and the empty space below the last card has no obvious
  //     drop affordance — the user has to aim above the last
  //     card to land the drop at the bottom.
  const droppableId = `quadrant:${id}`;
  const {
    setNodeRef: setEmptyListRef,
    isOver: isOverEmpty,
  } = useDroppable({ id: droppableId, disabled: reorderDisabled });
  const {
    setNodeRef: setAppendZoneRef,
    isOver: isOverAppend,
  } = useDroppable({ id: droppableId, disabled: reorderDisabled });

  const emptyUlClass = `task-list task-list-empty-drop${isOverEmpty ? ' is-over' : ''}`;
  const appendZoneClass = `task-list-append-zone${isOverAppend ? ' is-over' : ''}`;

  return (
    <section className={`quadrant quadrant-${id}`} aria-label={meta.title}>
      <header className="quadrant-header">
        <div>
          <h2 className="quadrant-title">
            <span className="quadrant-order">{meta.order}</span>
            {meta.title}
          </h2>
          <p className="quadrant-subtitle">{meta.subtitle}</p>
        </div>
        <span className="quadrant-count" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
      </header>

      {isEmpty ? (
        // Empty quadrant: the whole <ul> IS the drop zone. The
        // dashed border + flex centering make the "no tasks yet"
        // message read as the drop affordance.
        <ul ref={setEmptyListRef} className={emptyUlClass}>
          <p className="quadrant-empty">No tasks here yet.</p>
        </ul>
      ) : (
        // Non-empty quadrant: SortableContext handles item-on-item
        // reordering for cards within and across quadrants. We read
        // items from `liveTasks` so a card that was re-bucketed into
        // this quadrant mid-drag appears in the SortableContext and
        // dnd-kit can compute the right transform. The append zone
        // below catches drops that fall past the last card so the
        // user doesn't have to aim above it.
        <SortableContext items={liveTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="task-list">
            {liveTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                subject={subjects.find((s) => s.id === task.subject_id)}
                onToggleComplete={() => onToggleComplete(task)}
                onClick={() => onTaskClick(task)}
                onDelete={() => onDelete(task)}
                isBusy={isTaskBusy?.(task.id) ?? false}
                dragDisabled={reorderDisabled}
              />
            ))}
          </ul>
          <div
            ref={setAppendZoneRef}
            className={appendZoneClass}
            // Empty alt so screen readers don't announce this; the
            // visible "+ Add task" button below conveys the action.
            aria-hidden="true"
          />
        </SortableContext>
      )}

      <button type="button" className="add-btn" onClick={() => onAdd(id)}>
        + Add task
      </button>
    </section>
  );
}