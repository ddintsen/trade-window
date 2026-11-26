"use client";

import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { assetMeta, compactUnits, formatUnits } from "@/lib/chain/assets";
import type { Asset, TokenInfo } from "@/lib/chain/types";
import type { VerifiedList } from "@/lib/chain/verified";
import { cx } from "@/lib/cx";
import type { Offer } from "@/lib/venue/types";
import { Address } from "@/components/ui/address";
import { CopyButton } from "@/components/ui/copy";
import { EmptySlot, ItemIcon } from "./item-tile";
import { ItemTooltip } from "./item-tooltip";
import { itemLook, itemName, keyOf, slotCount, SLOTS, trustOf } from "./items";

export interface Marks {
  /** Their items whose amount changed since you last looked: key -> before and after. */
  deltas: Record<string, { before: bigint; after: bigint }>;
  /** Their items that were taken out since you last looked. */
  removed: Asset[];
}

const signed = (d: bigint, decimals: number, short = false) =>
  `${d > 0n ? "+" : "−"}${(short ? compactUnits : formatUnits)(d > 0n ? d : -d, decimals)}`;

/** A stack count in the corner of a slot, the way a game shows one. */
function Count({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "font-pixel text-shadow-count pointer-events-none absolute bottom-1 right-1.5 max-w-[calc(100%-0.5rem)] truncate text-[20px] text-ink sm:text-[22px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A word or a change in the other corner. */
function Mark({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-hidden className={cx("text-shadow-count pointer-events-none absolute left-1.5 top-1 text-[12px] font-semibold", className)}>
      {children}
    </span>
  );
}

/**
 * One side of the trade window: whose side it is, whether they are ready,
 * and up to eight items. Pointing at an item shows what it is; on their
 * side that is also how you look at it before you can get ready. Items
 * that are not verified say so wherever they appear.
 */
export function OfferPanel({
  side,
  mine,
  title,
  address,
  note,
  assets,
  want = [],
  staged = [],
  ready,
  version,
  tokens,
  verified = null,
  feeBps,
  inspected,
  marks,
  dropTarget = false,
  onItem,
  onLook,
  onStaged,
  onDismissRemoved,
  onDrop,
  footer,
  action,
  children,
  className,
}: {
  side: "maker" | "taker";
  mine: boolean;
  title: string;
  /** The account on this side, shown under the title; empty to show none. */
  address: string;
  /** One line under the address, such as "First trade with this account". */
  note?: ReactNode;
  assets: Asset[];
  /** A named price: what the maker asks this side to put in, shown as wanted items. */
  want?: Asset[];
  staged?: Offer[];
  ready: boolean;
  version: number;
  tokens: Map<string, TokenInfo>;
  verified?: VerifiedList | null;
  /** On the side the viewer receives: the room's fee, so each item says what arrives. */
  feeBps?: number;
  inspected?: Record<string, string>;
  marks?: Marks;
  dropTarget?: boolean;
  onItem?: (a: Asset) => void;
  onLook?: (a: Asset) => void;
  onStaged?: (o: Offer) => void;
  onDismissRemoved?: (a: Asset) => void;
  onDrop?: (key: string) => void;
  footer?: ReactNode;
  /** The side's own action, such as adding from the wallet, beside the title where a docked bar never covers it. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const stagedNew = staged.filter((o) => !assets.some((a) => keyOf(a) === keyOf(o)));
  const removed = marks?.removed ?? [];
  const wanted = assets.length === 0 ? want : [];
  const used = assets.length + stagedNew.length + removed.length + wanted.length;
  // One row of four until it fills, then the whole bag of eight: empty rows only cost height.
  const free = Math.max(0, (used >= SLOTS / 2 ? SLOTS : SLOTS / 2) - used);
  const tone = side === "maker" ? "text-maker" : "text-taker";

  return (
    <section
      aria-label={title}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={
        onDrop
          ? (e) => {
              e.preventDefault();
              const key = e.dataTransfer.getData("application/x-tw-item");
              if (key) onDrop(key);
            }
          : undefined
      }
      className={cx(
        "flex w-full flex-col gap-5 notch notch-lg slab p-5 transition-colors duration-500 sm:p-6",
        side === "maker" ? (ready ? "bg-maker-lit" : "bg-maker-bg") : ready ? "bg-taker-lit" : "bg-taker-bg",
        className,
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className={cx("font-pixel min-w-0 text-[2.25rem] sm:text-[2.5rem]", tone)}>{title}</h2>
          <div className="flex items-center gap-4">
            <p aria-live="polite" className={cx("shrink-0 text-right text-sm font-medium", tone)}>
              {ready ? `Ready on version ${version}` : ""}
            </p>
            {action}
          </div>
        </div>
        {address && (
          <div className="flex min-w-0 items-center gap-1 text-sm text-muted">
            <Address value={address} />
            <CopyButton text={address} className="py-0.5" />
          </div>
        )}
        {note && <p className="text-sm text-muted">{note}</p>}
      </header>

      <ul
        className={cx("grid grid-cols-4 gap-2.5 notch transition-colors", dropTarget && "bg-ground/30")}
        aria-label={`${title}, ${assets.length} of ${SLOTS} places used`}
      >
        {assets.map((a) => {
          const meta = assetMeta(a.kind, a.denom, tokens);
          const key = keyOf(a);
          const delta = marks?.deltas[key];
          const unseen = !mine && inspected !== undefined && inspected[key] !== a.amount;
          const stagedMore = staged.find((o) => keyOf(o) === key);
          const trust = trustOf(a, verified);
          const tipId = `tip-${side}-${key.replace(/[^a-z0-9]/gi, "-")}`;
          const show = () => {
            setTip(key);
            onLook?.(a);
          };
          const more = stagedMore ? `, ${formatUnits(stagedMore.amount, meta.decimals)} more not sent yet` : "";
          const changed = delta ? `, changed by ${signed(delta.after - delta.before, meta.decimals)}` : "";
          const label = `${itemName(a, meta)}${trust && !trust.verified ? ", not verified" : ""}${unseen ? ", not looked at yet" : ""}${changed}${more}${mine ? ", take back" : ""}`;
          const handlers = {
            onClick: () => {
              show();
              onItem?.(a);
            },
            // Pointing shows the tooltip at once, but an item counts as looked at only when the
            // pointer moves over it: a layout shift under a resting pointer is not a look.
            onMouseEnter: () => setTip(key),
            onPointerMove: (e: ReactPointerEvent) => {
              if (e.pointerType === "mouse" && (e.movementX !== 0 || e.movementY !== 0)) show();
            },
            onMouseLeave: () => setTip((t) => (t === key ? null : t)),
            onFocus: show,
            onBlur: () => setTip((t) => (t === key ? null : t)),
          };
          return (
            <li key={key} className="relative min-w-0">
              <button
                type="button"
                {...handlers}
                aria-describedby={tip === key ? tipId : undefined}
                aria-label={label}
                className={cx("relative block w-full notch transition-[filter] duration-200 hover:brightness-125", delta && "ring-2 ring-alert")}
              >
                <ItemIcon look={{ ...itemLook(a, meta), side }} dim={unseen} />
                <Count>{slotCount(a, meta)}</Count>
                {delta ? (
                  <Mark className="font-pixel text-[18px] font-normal text-alert">{signed(delta.after - delta.before, meta.decimals, true)}</Mark>
                ) : unseen ? (
                  <Mark className="text-frost">Look</Mark>
                ) : stagedMore ? (
                  <Mark className="font-pixel text-[18px] font-normal text-frost">+{compactUnits(stagedMore.amount, meta.decimals)}</Mark>
                ) : trust && !trust.verified ? (
                  <Mark className="text-alert">Unverified</Mark>
                ) : null}
              </button>
              {tip === key && (
                <ItemTooltip id={tipId} kind={a.kind} denom={a.denom} amount={BigInt(a.amount)} tokens={tokens} trust={trust} feeBps={feeBps} />
              )}
            </li>
          );
        })}

        {stagedNew.map((o) => {
          const meta = assetMeta(o.kind, o.denom, tokens);
          return (
            <li key={`staged-${keyOf(o)}`} className="relative min-w-0">
              <button
                type="button"
                onClick={() => onStaged?.(o)}
                aria-label={`${itemName(o, meta)}, not sent yet, remove`}
                className="relative block w-full notch transition-opacity hover:opacity-100 [&>span:first-child]:opacity-45"
              >
                <ItemIcon look={{ ...itemLook(o, meta), side }} />
                <Count className="text-frost">{slotCount(o, meta)}</Count>
                <Mark className="text-frost">Not sent</Mark>
              </button>
            </li>
          );
        })}

        {removed.map((a) => {
          const meta = assetMeta(a.kind, a.denom, tokens);
          return (
            <li key={`removed-${keyOf(a)}`} className="relative min-w-0">
              <button
                type="button"
                onClick={() => onDismissRemoved?.(a)}
                aria-label={`Removed: ${itemName(a, meta)}. Dismiss`}
                className="relative block aspect-square w-full notch bg-alert-bg"
              >
                <Mark className="text-alert">Removed</Mark>
                <Count className="text-alert line-through">{slotCount(a, meta)}</Count>
              </button>
            </li>
          );
        })}

        {wanted.map((a) => {
          const meta = assetMeta(a.kind, a.denom, tokens);
          const key = `want-${keyOf(a)}`;
          const trust = trustOf(a, verified);
          const tipId = `tip-${side}-${key.replace(/[^a-z0-9]/gi, "-")}`;
          return (
            <li key={key} className="relative min-w-0">
              <button
                type="button"
                onMouseEnter={() => setTip(key)}
                onMouseLeave={() => setTip((t) => (t === key ? null : t))}
                onFocus={() => setTip(key)}
                onBlur={() => setTip((t) => (t === key ? null : t))}
                onClick={() => setTip(key)}
                aria-describedby={tip === key ? tipId : undefined}
                aria-label={`Wanted: ${itemName(a, meta)}${trust && !trust.verified ? ", not verified" : ""}`}
                className="relative block w-full notch [&>span:first-child]:opacity-50"
              >
                <ItemIcon look={{ ...itemLook(a, meta), side }} />
                <Count className="text-frost">{slotCount(a, meta)}</Count>
                <Mark className="text-frost">Wanted</Mark>
              </button>
              {tip === key && <ItemTooltip id={tipId} kind={a.kind} denom={a.denom} amount={BigInt(a.amount)} tokens={tokens} trust={trust} />}
            </li>
          );
        })}

        {Array.from({ length: free }, (_, i) => (
          <li key={`empty-${i}`} aria-hidden>
            <EmptySlot highlight={dropTarget && i === 0} />
          </li>
        ))}
      </ul>

      {children}
      {footer}
    </section>
  );
}
