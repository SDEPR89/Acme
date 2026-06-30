import type { Task, Subject } from '../types';
import { TaskCard } from './TaskCard';

interface Props {
  tasks: Task[];
  subjects: Subject[];
  onToggleComplete: (task: Task) => void;
  onTaskClick: (task: Task) => void;
  onDelete: (task: Task) => void;
  loading: boolean;
  isTaskBusy?: (taskId: string) => boolean;
  // Mobile-only: tapping a card's status dot opens the full-page
  // StatusDetail picker. DoneList forwards this to each TaskCard so
  // a done task can also have its status edited from the dot (e.g.
  // marking a returned homework as "Submitted" without re-opening
  // the edit modal). When undefined, the dot is a non-interactive
  // <span> — same convention as Quadrant.
  onOpenStatusDetail?: (task: Task) => void;
}

export function DoneList({
  tasks,
  subjects,
  onToggleComplete,
  onTaskClick,
  onDelete,
  loading,
  isTaskBusy,
  onOpenStatusDetail,
}: Props) {
  if (loading) return <p className="dashboard-status">Loading…</p>;
  if (tasks.length === 0) {
    return (
      <div className="done-empty done-empty--enter">
        <p>No completed tasks yet.</p>
        <p className="muted">Mark a task done in the Active view and it will show up here.</p>
      </div>
    );
  }

  return (
    <div className="done-list done-list--enter">
      <ul className="task-list">
        {tasks.map((task) => {
          const subject = subjects.find((s) => s.id === task.subject_id);
          return (
            <TaskCard
              key={task.id}
              task={task}
              subject={subject}
              onToggleComplete={() => onToggleComplete(task)}
              onClick={() => onTaskClick(task)}
              onDelete={() => onDelete(task)}
              isBusy={isTaskBusy?.(task.id) ?? false}
              onOpenStatusDetail={
                onOpenStatusDetail ? () => onOpenStatusDetail(task) : undefined
              }
            />
          );
        })}
      </ul>
    </div>
  );
}
