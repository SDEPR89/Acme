import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onResolve: (ok: boolean) => void;
}

// A small modal that asks the user to confirm or cancel an action. The
// component is purely presentational — the surrounding useConfirm hook
// owns the queue and the resolution promise. We mirror the TaskModal
// chrome (Escape to cancel, click backdrop to cancel, focus the cancel
// button by default so a stray Enter doesn't accidentally confirm a
// destructive action).
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onResolve,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResolve(false);
    };
    document.addEventListener('keydown', onKey);
    // Move focus to the cancel button so Enter doesn't accidentally
    // confirm a destructive action. The user has to Tab once to reach
    // the confirm button — small friction, big safety win.
    cancelRef.current?.focus();
    // Lock body scroll while the dialog is up — same recipe as the
    // other modals so layout doesn't shift behind it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onResolve]);

  return (
    <div
      className="modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onClick={(e) => {
        if (e.target === e.currentTarget) onResolve(false);
      }}
    >
      <div className="modal confirm-dialog">
        <header className="modal-header">
          <h2 id="confirm-dialog-title">{title}</h2>
        </header>

        <div className="confirm-dialog-body">
          <p id="confirm-dialog-message" className="confirm-dialog-message">
            {message}
          </p>
        </div>

        <footer className="modal-footer modal-footer-right">
          <button
            ref={cancelRef}
            type="button"
            className="btn-secondary"
            onClick={() => onResolve(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}