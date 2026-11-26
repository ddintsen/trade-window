import { isPracticeAddress, shortAddress } from "@/lib/format";
import { cx } from "@/lib/cx";

/** An address in short form; the full value is in the title and for screen readers. */
export function Address({ value, className }: { value: string; className?: string }) {
  if (!value) return <span className={cx("text-muted", className)}>Open seat</span>;
  if (isPracticeAddress(value)) return <span className={className}>{shortAddress(value)}</span>;
  return (
    <span className={cx("font-mono text-[0.92em] tracking-[-0.01em]", className)} title={value}>
      <span aria-hidden>{shortAddress(value)}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
