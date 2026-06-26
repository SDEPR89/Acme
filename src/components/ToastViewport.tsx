import type { Toast } from '../hooks/useToast';

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

// Purely presentational — owns no state, no timers. The parent
// (ToastProvider) decides what to show and when to dismiss.
//
// Renders a fixed top-center stack. `pointer-events: none` on the
// viewport (set in CSS) lets clicks pass through the gaps between
// toasts; individual toasts re-enable pointer events so the × button
// works.
export function ToastViewport({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.kind}`}
          // `role="alert"` makes screen readers announce immediately;
          // success uses the softer `role="status"` so they don't
          // interrupt. Live region on the parent handles the rest.
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}