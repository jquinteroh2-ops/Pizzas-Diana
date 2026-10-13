import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { ApiError } from '../lib/api';

type Kind = 'success' | 'error' | 'warning';
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  text?: string;
}

interface ToastApi {
  success: (title: string, text?: string) => void;
  error: (title: string, text?: string) => void;
  warning: (title: string, text?: string) => void;
  /** Muestra el mensaje de un error de la API (o uno genérico). */
  fail: (err: unknown, title?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let nextId = 1;

const STYLE: Record<Kind, { icon: typeof CheckCircle2; ring: string; color: string }> = {
  success: { icon: CheckCircle2, ring: 'border-l-emerald-600', color: 'text-emerald-700' },
  warning: { icon: AlertTriangle, ring: 'border-l-amber-500', color: 'text-amber-600' },
  error: { icon: XCircle, ring: 'border-l-brand-800', color: 'text-brand-800' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, title: string, text?: string) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, text }]);
      setTimeout(() => remove(id), kind === 'error' ? 7000 : 4500);
    },
    [remove],
  );
  const apiValue: ToastApi = {
    success: (t, x) => push('success', t, x),
    error: (t, x) => push('error', t, x),
    warning: (t, x) => push('warning', t, x),
    fail: (err, title = 'No se pudo completar la operación') =>
      push('error', title, err instanceof ApiError || err instanceof Error ? err.message : undefined),
  };
  return (
    <Ctx.Provider value={apiValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const s = STYLE[t.kind];
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl border border-l-4 border-cream-300 bg-white p-4 shadow-pop ${s.ring}`}
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${s.color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                {t.text && <p className="mt-0.5 text-sm text-ink-500">{t.text}</p>}
              </div>
              <button className="text-ink-400 hover:text-ink-700" onClick={() => remove(t.id)} aria-label="Cerrar">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast fuera de ToastProvider');
  return c;
}
