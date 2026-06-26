// Shared domain types + constants for the Eisenhower matrix tracker.

export type Quadrant = 'do_first' | 'schedule' | 'delegate' | 'eliminate';

export interface Subject {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  due_date: string | null; // ISO date (YYYY-MM-DD)
  quadrant: Quadrant;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Dense per-(user, quadrant) order set by drag-and-drop. 0..N-1
  // within each quadrant; null means the row hasn't been touched since
  // the user dragged anything in this quadrant (or the row pre-dates
  // the feature). Sorts by sort_order ascending when present, then by
  // created_at desc as the tiebreaker for null rows.
  sort_order: number | null;
}

// Insert payload shape — Supabase fills id / user_id / timestamps via defaults
// and RLS, but we keep them optional so callers can omit.
export type TaskInsert = {
  title: string;
  description?: string | null;
  subject_id?: string | null;
  due_date?: string | null;
  quadrant: Quadrant;
  // Omit on insert; the row defaults to null and the dashboard treats
  // null as "append to the end" the next time the user drags in this
  // quadrant.
  sort_order?: number | null;
};

export type SubjectInsert = {
  name: string;
  color?: string | null;
};

// Metadata for rendering the 4 quadrants in canonical order (urgent × important).
export const QUADRANTS: readonly {
  id: Quadrant;
  title: string;
  subtitle: string;
  /** Order on screen (1..4). */
  order: 1 | 2 | 3 | 4;
}[] = [
  { id: 'do_first',  title: 'Do First',    subtitle: 'Urgent & important',     order: 1 },
  { id: 'schedule',  title: 'Schedule',    subtitle: 'Important, not urgent',  order: 2 },
  { id: 'delegate',  title: 'Delegate',    subtitle: 'Urgent, not important',  order: 3 },
  { id: 'eliminate', title: 'Eliminate',   subtitle: 'Neither',                order: 4 },
] as const;