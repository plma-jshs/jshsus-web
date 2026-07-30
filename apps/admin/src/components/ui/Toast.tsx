import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastRecord = ToastInput & { id: number };

type ToastContextValue = {
  showToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') return <CheckCircle2 size={18} aria-hidden="true" />;
  if (tone === 'warning') return <AlertTriangle size={18} aria-hidden="true" />;
  if (tone === 'danger') return <XCircle size={18} aria-hidden="true" />;
  return <Info size={18} aria-hidden="true" />;
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const tone = toast.tone ?? 'info';
  const [isLeaving, setIsLeaving] = useState(false);
  const exitTimerRef = useRef<number>();

  const requestDismiss = useCallback(() => {
    if (exitTimerRef.current !== undefined) return;
    setIsLeaving(true);
    exitTimerRef.current = window.setTimeout(() => onDismiss(toast.id), 180);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (toast.duration === 0) return;
    const timer = window.setTimeout(requestDismiss, toast.duration ?? 4200);
    return () => window.clearTimeout(timer);
  }, [requestDismiss, toast.duration]);

  useEffect(
    () => () => {
      if (exitTimerRef.current !== undefined) window.clearTimeout(exitTimerRef.current);
    },
    [],
  );

  return (
    <article
      className={`ui-toast ui-toast--${tone}${isLeaving ? ' is-leaving' : ''}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <ToastIcon tone={tone} />
      <div className="ui-toast__content">
        <strong>{toast.title}</strong>
        {toast.description ? <p>{toast.description}</p> : null}
      </div>
      <button
        className="ui-toast__close"
        type="button"
        aria-label="알림 닫기"
        onClick={requestDismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
