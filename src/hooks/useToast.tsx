import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ToastViewport } from '../components/ToastViewport';

// ---------------------------------------------------------------------------
// useToast — top-center ephemeral feedback (errors and successes).
//
// Sits next to <ConfirmProvider> at the top of the tree. Anything that
// wants to surface a failure to the user calls useToast().showError(msg);
// success messages are available too via showSuccess(msg).
//
// Toasts auto-dismiss after 5 seconds but can be closed manually with the
// × button. Multiple toasts stack downward; each is independently
// dismissable and timers don't share state, so dismissing one doesn't
// affect the rest.
//
// Why no Promise return? Toasts are pure notification — there's nothing
// to "confirm" or "resolve". Compare with useConfirm, which returns a
// Promise because it gates a decision. Keep these separate so callers
// don't accidentally await a toast.
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_MS = 5000;

export type ToastKind = 'error' | 'success';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ShowOptions {
  /** Auto-dismiss delay in ms. Defaults to 5000. */
  duration?: number;
}

interface ToastContextValue {
  showError: (message: string, opts?: ShowOptions) => void;
  showSuccess: (message: string, opts?: ShowOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Monotonic id source — never reused across the lifetime of the
  // provider, so a late dismissal can't collide with a fresh toast.
  const idRef = useRef(0);
  // Per-toast dismiss timers, keyed by id. Refs so changing them
  // doesn't re-render; we only need them to be cancellable.
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Clear the auto-dismiss timer (no-op if already fired).
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string, opts?: ShowOptions) => {
      const id = ++idRef.current;
      const duration = opts?.duration ?? DEFAULT_DURATION_MS;
      const toast: Toast = { id, kind, message };
      setToasts((prev) => [...prev, toast]);
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const showError = useCallback(
    (message: string, opts?: ShowOptions) => show('error', message, opts),
    [show],
  );
  const showSuccess = useCallback(
    (message: string, opts?: ShowOptions) => show('success', message, opts),
    [show],
  );

  // Clean up any outstanding timers when the provider unmounts so
  // we don't call setState on a dead tree during fast refresh.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return ctx;
}