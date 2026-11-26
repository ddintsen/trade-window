"use client";

import { useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";

export type ToastTone = "neutral" | "done" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(title: string, opts: { tone?: ToastTone; body?: string; ms?: number } = {}) {
  const t: Toast = { id: nextId++, tone: opts.tone ?? "neutral", title, body: opts.body };
  toasts = [...toasts.slice(-2), t];
  emit();
  const ms = opts.ms ?? (t.tone === "error" ? 9000 : 5000);
  setTimeout(() => dismiss(t.id), ms);
  return t.id;
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const empty: Toast[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => toasts, () => empty);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 p-4 sm:bottom-0 sm:top-auto sm:items-end lg:bottom-auto lg:top-16">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cx(
            "pointer-events-auto w-full max-w-sm notch px-4 py-3 text-[15px] shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
            t.tone === "error" ? "bg-alert-bg text-alert" : "bg-raise text-ink",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{t.title}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-0.5 notch px-1.5 text-muted hover:text-ink"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          {t.body && <p className={cx("mt-0.5 text-sm", t.tone === "error" ? "text-alert/90" : "text-muted")}>{t.body}</p>}
        </div>
      ))}
    </div>
  );
}
