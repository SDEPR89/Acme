import type { Task, Quadrant } from '../types';

// Sentinel prefix used for drop targets that represent the whole
// quadrant (used when the user drops onto an empty quadrant or the
// drop zone below a non-empty list). Decoded in `applyMove`.
const QUADRANT_PREFIX = 'quadrant:';

/** Decode a drop target id into either a task id or a quadrant id. */
export type DropTarget =
  | { kind: 'task'; taskId: string }
  | { kind: 'quadrant'; quadrant: Quadrant };

export function decodeDropTarget(overId: string): DropTarget {
  if (overId.startsWith(QUADRANT_PREFIX)) {
    return { kind: 'quadrant', quadrant: overId.slice(QUADRANT_PREFIX.length) as Quadrant };
  }
  return { kind: 'task', taskId: overId };
}

/**
 * Result of computing a move before persisting it.
 * - `byQuadrant` contains the *full* ordered list for every quadrant
 *   whose order changed (source, destination, and any quadrants that
 *   shifted to make room).
 * - `movedQuadrant` is the quadrant the dragged card now lives in.
 *   Null means the move was within a single quadrant (no `quadrant`
 *   column update needed, only sort_order).
 */
export interface MoveResult {
  byQuadrant: Partial<Record<Quadrant, Task[]>>;
  movedQuadrant: Quadrant | null;
}

/**
 * Pure: compute the new ordering for one drag-and-drop move. Used by
 * `useTasks.reorder` to update local state optimistically, and again
 * (in reverse) to roll back on a server error.
 *
 * Inputs are NOT mutated. The returned lists are shallow copies of
 * the affected tasks with their `sort_order` set to the new dense
 * index (0..N-1).
 *
 * @param tasks           The full task list (active tasks only —
 *                        completed tasks aren't draggable).
 * @param activeId        The dragged task's id.
 * @param overId          Either another task id (drop ON a card) or
 *                        "quadrant:<id>" (drop on an empty quadrant or
 *                        its drop zone).
 * @param sourceQuadrant  Optional override for the source quadrant.
 *                        The dashboard re-buckets the dragged card
 *                        mid-drag (in the live mirror) so by the
 *                        time `applyMove` runs on dragend the
 *                        `active.quadrant` field already reflects the
 *                        destination. Without this override the
 *                        function would treat the move as a no-op
 *                        within-quadrant and miss the source bucket.
 *                        Pass the original source quadrant from
 *                        `onDragStart` to keep this function pure of
 *                        drag-state side effects.
 */
export function applyMove(
  tasks: Task[],
  activeId: string,
  overId: string,
  sourceQuadrantOverride?: Quadrant,
): MoveResult | null {
  const active = tasks.find((t) => t.id === activeId);
  if (!active) return null;
  const target = decodeDropTarget(overId);
  const sourceQuadrant = sourceQuadrantOverride ?? active.quadrant;

  // Bucket by quadrant. We copy each quadrant's list so we don't
  // mutate the input.
  const buckets: Record<Quadrant, Task[]> = {
    do_first: [],
    schedule: [],
    delegate: [],
    eliminate: [],
  };
  for (const t of tasks) buckets[t.quadrant].push(t);

  // Take the dragged card OUT of its source bucket. We splice by id
  // rather than index because the source list isn't sorted by id.
  // When `sourceQuadrantOverride` is provided (the live mirror has
  // already re-bucketed the card into the destination), look up
  // `active` in whichever bucket it actually lives in.
  let actualSourceList: Task[] | null = null;
  let actualSourceQuadrant: Quadrant | null = null;
  if (sourceQuadrantOverride && sourceQuadrantOverride !== active.quadrant) {
    for (const q of Object.keys(buckets) as Quadrant[]) {
      const i = buckets[q].findIndex((t) => t.id === activeId);
      if (i !== -1) {
        actualSourceList = buckets[q];
        actualSourceQuadrant = q;
        break;
      }
    }
    if (!actualSourceList) return null;
  } else {
    actualSourceList = buckets[sourceQuadrant];
    actualSourceQuadrant = sourceQuadrant;
  }
  const fromIdx = actualSourceList.findIndex((t) => t.id === activeId);
  if (fromIdx === -1) return null;
  // After the early returns above, `actualSourceList` is guaranteed
  // non-null AND it contains `active`. Narrow to a concrete Quadrant
  // so the branches below don't need `Quadrant | null` checks.
  const sourceBucket: Task[] = actualSourceList;
  const liveQuadrant: Quadrant = actualSourceQuadrant;
  const [moved] = sourceBucket.splice(fromIdx, 1);

  if (target.kind === 'quadrant') {
    // Drop on an empty quadrant or its drop zone. Append at the end.
    // When the destination is the same bucket the active already lives
    // in (within-quadrant drop on the empty-zone of a quadrant that
    // got the active mid-drag via onDragOver), `actualSourceQuadrant`
    // and `destQuadrant` are the same. Splice already removed it; push
    // it back so the destination list ends with the active at the end.
    const destQuadrant = target.quadrant;
    if (destQuadrant !== sourceQuadrant) {
      moved.quadrant = destQuadrant;
    }
    buckets[destQuadrant].push(moved);
  } else if (target.taskId === active.id) {
    // Drop over the dragged card itself. After onDragOver the active
    // is already in its destination bucket (which may differ from the
    // original source when this is a cross-quadrant drop into a
    // previously-empty quadrant). The dragged card's own droppable
    // becomes the `over` target once the empty <ul> unmounts and the
    // SortableContext takes over — without this branch the lookup
    // below fails because we already spliced the active out of its
    // bucket. The destination is the bucket the active lives in
    // (`liveQuadrant`); just re-insert at the end.
    if (liveQuadrant !== sourceQuadrant) {
      moved.quadrant = liveQuadrant;
    }
    buckets[liveQuadrant].push(moved);
  } else {
    // Drop on a different card. Look up which quadrant that card is
    // in.
    let destQuadrant: Quadrant | null = null;
    let insertIdx = -1;
    for (const q of Object.keys(buckets) as Quadrant[]) {
      const i = buckets[q].findIndex((t) => t.id === target.taskId);
      if (i !== -1) {
        destQuadrant = q;
        insertIdx = i;
        break;
      }
    }
    if (!destQuadrant || insertIdx === -1) {
      // The target id isn't in any bucket — stale drop. Bail rather
      // than corrupt state.
      return null;
    }
    if (destQuadrant !== sourceQuadrant) {
      moved.quadrant = destQuadrant;
    }
    // dnd-kit reports "drop on hovered item" as landing AFTER it for
    // downward drags, BEFORE it for upward drags. We splice at the
    // found index (BEFORE the hovered card) and rely on the dnd-kit
    // pointer math to already reflect intent. For the cross-list case
    // we also need to adjust the insert index now that we've removed
    // the dragged card from its source list — but since insertIdx is
    // in the *destination* list (which we haven't touched), it's
    // still correct.
    buckets[destQuadrant].splice(insertIdx, 0, moved);
  }

  // Renumber the affected buckets densely. Quadrants we didn't touch
  // keep their existing order.
  //
  // For a cross-quadrant move (sourceQuadrantOverride was supplied
  // and the active was already re-bucketed mid-drag) we MUST rewrite
  // both:
  //   - the original source (`sourceQuadrant`) — the surviving rows
  //     still carry the pre-move sort_order, which now has a gap where
  //     the moved card used to be. Without rewriting them densely,
  //     the next within-quadrant reorder would skip over the gap.
  //   - the destination (`liveQuadrant`, where the active actually
  //     lived in the live mirror) — the active's `sort_order` was set
  //     to the insert index by onDragOver and needs to be written
  //     densely too.
  // For a within-quadrant move these are the same quadrant and we
  // still need to renumber it (the active's index changed).
  const byQuadrant: Partial<Record<Quadrant, Task[]>> = {};
  const touched: Quadrant[] = [];
  if (sourceQuadrant !== liveQuadrant) touched.push(sourceQuadrant);
  if (!touched.includes(liveQuadrant)) touched.push(liveQuadrant);

  for (const q of touched) {
    const list = buckets[q].map((t, i) => ({ ...t, sort_order: i }));
    byQuadrant[q] = list;
  }

  return {
    byQuadrant,
    movedQuadrant: moved.quadrant !== sourceQuadrant ? moved.quadrant : null,
  };
}

/**
 * Build a snapshot of the tasks that will be touched by a move, so we
 * can roll back if the server rejects the write. Mirrors `applyMove`'s
 * affected quadrants.
 */
export function snapshotMove(
  _tasks: Task[],
  result: MoveResult,
): { quadrant: Quadrant; tasks: Task[] }[] {
  return Object.entries(result.byQuadrant).map(([q, list]) => ({
    quadrant: q as Quadrant,
    // Deep clone so the snapshot is independent of subsequent state updates.
    tasks: list.map((t) => ({ ...t })),
  }));
}