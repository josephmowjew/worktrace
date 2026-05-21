import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { PropsWithChildren } from "react";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
};

type ToastInput = Omit<Toast, "id">;

type ToastContextValue = {
  notify: (toast: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  success: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
  error: "border-red-300/20 bg-red-500/10 text-red-100",
  info: "border-blue-300/20 bg-blue-500/10 text-blue-100",
};

const iconClasses: Record<ToastTone, string> = {
  success: "text-emerald-300",
  error: "text-red-300",
  info: "text-blue-300",
};

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => remove(id), toast.tone === "error" ? 7000 : 4200);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (title, message) => notify({ tone: "success", title, message }),
      error: (title, message) => notify({ tone: "error", title, message }),
      info: (title, message) => notify({ tone: "info", title, message }),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-12 z-[10000] grid w-[min(380px,calc(100vw-2rem))] gap-2">
        {toasts.map((toast) => {
          const Icon =
            toast.tone === "success"
              ? CheckCircle2
              : toast.tone === "error"
                ? XCircle
                : Info;

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl border p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl ${toneClasses[toast.tone]}`}
            >
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClasses[toast.tone]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{toast.title}</p>
                  {toast.message ? (
                    <p className="mt-1 text-xs leading-5 opacity-85">{toast.message}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => remove(toast.id)}
                  className="rounded-lg p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100"
                  aria-label="Dismiss notification"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
