import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

// ---------------------------------------------------------------------------
// useConfirm — promise-based confirm dialog hook.
//
// Replaces window.confirm() with a real React modal so the call works in
// any environment (Dia's panel, mobile webviews, embedded iframes) and
// matches the rest of the dashboard's liquid-glass styling.
//
// Usage:
//   const confirm = useConfirm();
//   const ok = await confirm({
//     title: 'Delete task?',
//     message: 'This cannot be undone.',
//     confirmLabel: 'Delete',
//     danger: true,
//   });
//   if (!ok) return;
//
// Concurrent calls are queued: each request gets a Promise, and the
// dialog walks through the queue one at a time. The most recent call
// always wins the *current* dialog, but earlier calls don't disappear —
// they each wait their turn.
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Text for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Text for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** When true, the confirm button uses the destructive style. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  // FIFO queue. We keep an array instead of a single ref so multiple
  // confirms fire in quick succession (e.g. a script-like bulk delete
  // path) all get answered rather than swallowed.
  const [active, setActive] = useState<PendingConfirm | null>(null);
  const queueRef = useRef<PendingConfirm[]>([]);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      queueRef.current.push({ ...opts, resolve });
      // If nothing is showing, immediately surface the head of the queue.
      setActive((current) => current ?? queueRef.current.shift() ?? null);
    });
  }, []);

  // Whenever the active confirm resolves, the next one (if any) is
  // promoted. This effect keeps `active` in sync with the queue after
  // each resolution.
  useEffect(() => {
    if (active) return;
    const next = queueRef.current.shift();
    if (next) setActive(next);
  }, [active]);

  const handleResolve = useCallback((ok: boolean) => {
    setActive((current) => {
      if (current) current.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {active && (
        <ConfirmDialog
          title={active.title}
          message={active.message}
          confirmLabel={active.confirmLabel}
          cancelLabel={active.cancelLabel}
          danger={active.danger}
          onResolve={handleResolve}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside a <ConfirmProvider>');
  }
  return ctx.confirm;
}