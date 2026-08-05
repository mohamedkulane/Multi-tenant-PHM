import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { navigate } from "../lib/navigation";

type ToastTone = "success" | "error" | "info";

interface ToastInput {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
  actionLabel?: string;
  actionHref?: string;
}

interface ToastRecord extends Required<Pick<ToastInput, "title" | "tone" | "durationMs">> {
  id: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}

const toastEvent = "phms:toast";

export function showToast({
  title,
  message,
  tone = "success",
  durationMs = 4_000,
  actionLabel,
  actionHref,
}: ToastInput) {
  window.dispatchEvent(
    new CustomEvent<ToastInput>(toastEvent, {
      detail: {
        title,
        ...(message ? { message } : {}),
        tone,
        durationMs,
        ...(actionLabel ? { actionLabel } : {}),
        ...(actionHref ? { actionHref } : {}),
      },
    }),
  );
}

export function ToastViewport() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<ToastInput>).detail;
      const toast: ToastRecord = {
        id: crypto.randomUUID(),
        title: detail.title,
        ...(detail.message ? { message: detail.message } : {}),
        ...(detail.actionLabel ? { actionLabel: detail.actionLabel } : {}),
        ...(detail.actionHref ? { actionHref: detail.actionHref } : {}),
        tone: detail.tone ?? "success",
        durationMs: detail.durationMs ?? 4_000,
      };
      setToasts((current) => [...current, toast].slice(-4));
      window.setTimeout(() => {
        setToasts((current) => current.filter(({ id }) => id !== toast.id));
      }, toast.durationMs);
    };
    window.addEventListener(toastEvent, receive);
    return () => window.removeEventListener(toastEvent, receive);
  }, []);

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(92vw,24rem)] flex-col gap-3"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => {
        const tone =
          toast.tone === "success"
            ? "border-emerald-200 bg-white text-emerald-700"
            : toast.tone === "error"
              ? "border-rose-200 bg-white text-rose-700"
              : "border-blue-200 bg-white text-blue-700";
        const Icon =
          toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? AlertTriangle : Info;
        return (
          <section
            key={toast.id}
            className={`pointer-events-auto flex gap-3 rounded-2xl border p-4 shadow-[0_18px_55px_rgba(15,23,42,0.18)] ${tone}`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <Icon className="mt-0.5 shrink-0" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-950">{toast.title}</p>
              {toast.message ? (
                <p className="mt-1 text-sm leading-5 text-slate-600">{toast.message}</p>
              ) : null}
              {toast.actionLabel && toast.actionHref ? (
                <button
                  type="button"
                  className="mt-3 text-sm font-bold text-blue-700 underline underline-offset-4"
                  onClick={() => navigate(toast.actionHref!)}
                >
                  {toast.actionLabel}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss notification"
              onClick={() => setToasts((current) => current.filter(({ id }) => id !== toast.id))}
            >
              <X size={16} />
            </button>
          </section>
        );
      })}
    </div>
  );
}
