import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
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

function ToastIcon({ tone, size }: { tone: ToastTone; size: number }) {
  if (tone === 'success') return <CheckCircle2 size={size} aria-hidden="true" />;
  if (tone === 'warning') return <AlertTriangle size={size} aria-hidden="true" />;
  if (tone === 'danger') return <XCircle size={size} aria-hidden="true" />;
  return <Info size={size} aria-hidden="true" />;
}

function ToastItem({
  toast,
  onDismiss,
  classPrefix,
  iconSize,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
  classPrefix: string;
  iconSize: number;
}) {
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
      className={`${classPrefix} ${classPrefix}--${tone}${isLeaving ? ' is-leaving' : ''}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <ToastIcon tone={tone} size={iconSize} />
      <div className={`${classPrefix}__content`}>
        <strong>{toast.title}</strong>
        {toast.description ? <p>{toast.description}</p> : null}
      </div>
      <button
        className={`${classPrefix}__close`}
        type="button"
        aria-label="알림 닫기"
        onClick={requestDismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

export function ToastProvider({
  children,
  classPrefix,
  iconSize = 18,
  maxVisible = 4,
}: {
  children: ReactNode;
  classPrefix: string;
  iconSize?: number;
  maxVisible?: number;
}) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const showToast = useCallback(
    (toast: ToastInput) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current.slice(-Math.max(maxVisible - 1, 0)), { ...toast, id }]);
      return id;
    },
    [maxVisible],
  );
  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={`${classPrefix}-viewport`} aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={dismissToast}
            classPrefix={classPrefix}
            iconSize={iconSize}
          />
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
