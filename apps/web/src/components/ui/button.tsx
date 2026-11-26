import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "lg" | "md" | "sm";

// Game keys: a block with stepped pixel corners on a darker base, its label
// in Handjet, pressing down when pressed. Every action is a key; nothing is
// a bare link.
const base =
  "font-pixel notch key inline-flex select-none items-center justify-center gap-2 whitespace-nowrap pb-[3px] tracking-[0.01em] disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-act text-ground disabled:bg-act/30 disabled:text-ground/70",
  secondary: "bg-raise text-ink disabled:text-muted",
  quiet: "bg-control text-frost hover:text-ink disabled:text-muted",
  danger: "bg-[#c95b67] text-ground disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  lg: "h-[54px] px-6 text-[25px]",
  md: "h-[46px] px-5 text-[22px]",
  sm: "h-10 px-4 text-[20px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
  busyLabel?: ReactNode;
}

export function Button({ variant = "secondary", size = "md", busy, busyLabel, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, size, className)}
    >
      {busy ? (busyLabel ?? children) : children}
    </button>
  );
}

interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...rest }: LinkButtonProps) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}
