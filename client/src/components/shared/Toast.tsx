import { useState, useCallback, createContext, useContext } from 'react';
import { CheckCircle, AlertTriangle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastFn {
  (message: string, type?: ToastType): void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

interface ToastContextType {
  toast: ToastFn;
}

const noop = (() => {}) as unknown as ToastFn;
noop.success = () => {};
noop.error = () => {};
noop.info = () => {};
const ToastContext = createContext<ToastContextType>({ toast: noop });

export function useToast(): ToastContextType & ToastFn {
  const ctx = useContext(ToastContext);
  // Support both: const { toast } = useToast() AND const toast = useToast(); toast.success()
  const fn = ctx.toast as any;
  fn.toast = ctx.toast;
  return fn;
}

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const toastFn = useCallback(((message: string, type?: ToastType) => addToast(message, type)) as ToastFn, [addToast]);
  toastFn.success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
  toastFn.error = useCallback((message: string) => addToast(message, 'error'), [addToast]);
  toastFn.info = useCallback((message: string) => addToast(message, 'info'), [addToast]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const icons = { success: CheckCircle, error: AlertTriangle, info: Info };
  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
  };
  const iconColors = { success: 'text-green-500', error: 'text-red-500', info: 'text-sky-500' };

  return (
    <ToastContext.Provider value={{ toast: toastFn }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${colors[t.type]} animate-toast-in min-w-[280px] max-w-sm`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${iconColors[t.type]}`} />
              <span className="text-sm font-medium flex-1">{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="p-0.5 opacity-60 hover:opacity-100 transition-opacity">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
