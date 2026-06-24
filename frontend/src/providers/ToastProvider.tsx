import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastCtx {
  push: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const META: Record<ToastKind, { icon: string; accent: string }> = {
  success: { icon: 'check_circle', accent: 'text-secondary' },
  error: { icon: 'error', accent: 'text-error' },
  info: { icon: 'info', accent: 'text-primary' },
  warning: { icon: 'warning', accent: 'text-tertiary-fixed-dim' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { ...t, id }]);
      window.setTimeout(() => remove(id), 4500);
    },
    [remove],
  );

  const helpers: ToastCtx = {
    push,
    success: (title, description) => push({ kind: 'success', title, description }),
    error: (title, description) => push({ kind: 'error', title, description }),
    info: (title, description) => push({ kind: 'info', title, description }),
    warning: (title, description) => push({ kind: 'warning', title, description }),
  };

  return (
    <Ctx.Provider value={helpers}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-slide-in-right flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-lg"
            role="status"
          >
            <span className={cn('material-symbols-outlined text-[22px]', META[t.kind].accent)}>
              {META[t.kind].icon}
            </span>
            <div className="flex-1">
              <p className="text-body-sm font-semibold text-on-surface">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-[13px] text-on-surface-variant">{t.description}</p>
              )}
            </div>
            <button
              onClick={() => remove(t.id)}
              className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
