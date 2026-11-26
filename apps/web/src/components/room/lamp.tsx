import { GLASS } from "@/components/brand/mark";
import { cx } from "@/lib/cx";

/**
 * A lock lamp: one glass cube in the side's colour. Lit when that side has
 * locked the current version, dark otherwise. State is also given in text.
 */
export function Lamp({ side, lit, className }: { side: "maker" | "taker"; lit: boolean; className?: string }) {
  const glass = GLASS[side];
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cx("h-7 w-7 shrink-0", className)}>
      {lit && <rect x="0" y="0" width="24" height="24" rx="6" fill={glass.core} opacity="0.18" />}
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="4"
        fill={lit ? glass.rim : "#313b37"}
        style={{ transition: "fill 400ms var(--ease-out-soft)" }}
      />
      <rect
        x="7.5"
        y="7.5"
        width="9"
        height="9"
        rx="2.2"
        fill={lit ? glass.core : "#171d1b"}
        style={{ transition: "fill 400ms var(--ease-out-soft)" }}
      />
    </svg>
  );
}
