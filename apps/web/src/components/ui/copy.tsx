"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";

export function CopyButton({ text, label = "Copy", done = "Copied", className }: { text: string; label?: string; done?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      // A small key by default; a caller passing a full key style (buttonClass) gets exactly that.
      className={className?.includes("key") ? className : cx("font-pixel notch key inline-flex h-8 items-center bg-control px-3 pb-[2px] text-[18px] text-frost hover:text-ink", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      <span aria-live="polite">{copied ? done : label}</span>
    </button>
  );
}
