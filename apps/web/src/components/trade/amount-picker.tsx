"use client";

import { useEffect, useRef, useState } from "react";
import { assetLabel, formatUnits, parseUnits, type AssetMeta } from "@/lib/chain/assets";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** An ask with no known holder: any amount the contract can hold. */
export const ANY = 9223372036854775807n;

/**
 * How much of one item: the Offer-X of a trade window. Presets for quick
 * picks, an exact field for everything else.
 */
export function AmountPicker({
  meta,
  verb,
  max,
  reserve = 0n,
  reserveNote,
  initial,
  busy,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  meta: AssetMeta;
  /** add from your wallet, take back from the window, or ask for in a named price. */
  verb: "add" | "take" | "ask";
  /** The most that can be picked, in base units. */
  max: bigint;
  /** Kept back from Max, for network fees. */
  reserve?: bigint;
  reserveNote?: string;
  initial?: bigint;
  busy?: boolean;
  confirmLabel: string;
  onConfirm: (amount: bigint) => void;
  onCancel: () => void;
}) {
  const usable = max > reserve ? max - reserve : 0n;
  const [value, setValue] = useState(() => (initial !== undefined && initial > 0n ? formatUnits(initial, meta.decimals).replace(/,/g, "") : ""));
  const parsed = parseUnits(value, meta.decimals);
  const label = assetLabel(meta);
  const error =
    value.trim() === ""
      ? null
      : parsed === null
        ? `Use at most ${meta.decimals} decimals`
        : parsed <= 0n
          ? "Enter more than zero"
          : parsed > max
            ? verb === "add"
              ? "More than you have"
              : verb === "ask"
                ? "More than they have"
                : "More than is in the window"
            : null;

  const preset = (part: bigint) => setValue(formatUnits(part, meta.decimals).replace(/,/g, ""));
  // Opened under an item, the form scrolls into view clear of the docked trade bar.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => form.current?.scrollIntoView({ block: "nearest" }), []);

  return (
    <form
      ref={form}
      className="flex scroll-mb-40 flex-col gap-4 notch bg-ground/55 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error && parsed !== null && parsed > 0n) onConfirm(parsed);
      }}
    >
      <Field
        label={`Amount of ${label}`}
        error={error}
        hint={
          verb === "ask"
            ? max >= ANY
              ? "Ask for exactly what you agreed."
              : `They have ${formatUnits(max, meta.decimals)} ${label}`
            : `${verb === "add" ? "You have" : "In the window:"} ${formatUnits(max, meta.decimals)} ${label}${reserve > 0n && reserveNote ? `. ${reserveNote}` : ""}`
        }
      >
        {({ id, describedBy, invalid }) => (
          <div className="relative">
            <Input
              id={id}
              autoFocus
              aria-describedby={describedBy}
              aria-invalid={invalid}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="tabular h-14 notch pr-[42%] text-[22px] font-medium"
            />
            <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 max-w-[40%] -translate-y-1/2 truncate text-[15px] text-muted">
              {label}
            </span>
          </div>
        )}
      </Field>
      {verb !== "ask" && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Quarter", part: usable / 4n },
            { label: "Half", part: usable / 2n },
            { label: verb === "add" ? "Max" : "All", part: verb === "add" ? usable : max },
          ].map((p) => (
            <Button key={p.label} variant="secondary" disabled={p.part <= 0n} onClick={() => preset(p.part)}>
              {p.label}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" busy={busy} disabled={!!error || parsed === null || parsed <= 0n}>
          {confirmLabel}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Never mind
        </Button>
      </div>
    </form>
  );
}
