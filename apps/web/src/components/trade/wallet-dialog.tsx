"use client";

import { useEffect, useRef, useState } from "react";
import { assetLabel, assetMeta } from "@/lib/chain/assets";
import { isMainnet, network } from "@/lib/chain/config";
import type { TokenInfo } from "@/lib/chain/types";
import { cx } from "@/lib/cx";
import type { InventoryItem, Offer } from "@/lib/venue/types";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AmountPicker, ANY } from "./amount-picker";
import { EmptySlot, ItemIcon } from "./item-tile";
import { ItemTooltip } from "./item-tooltip";
import { itemLook, itemName, keyOf, slotCount } from "./items";

/** A wallet this long gets a search field, and opens on its first rows. */
const SEARCH_FROM = 13;
const FIRST = 36;

/** Cells to the end of the last row, at least one full row. */
const fill = (count: number, cols: number) => Math.max(cols, Math.ceil(count / cols) * cols);

/**
 * Your wallet as a bag, opened from your offer: pick an item, choose how
 * much, and it waits in your offer until you put it in the window. In
 * "ask" mode the same bag shows what the other side holds (or, for an open
 * seat, what can be asked for), and picks go into a named price.
 */
export function WalletDialog({
  open,
  side,
  mode = "give",
  items,
  loading,
  error,
  tokens,
  practice,
  staged,
  reserveFor,
  full,
  refuse,
  onAdd,
  onClose,
}: {
  open: boolean;
  side: "maker" | "taker";
  mode?: "give" | "ask";
  items: InventoryItem[] | null;
  loading: boolean;
  error: Error | null;
  tokens: Map<string, TokenInfo>;
  practice: boolean;
  staged: Offer[];
  /** Kept back from Max for fees, per item key. */
  reserveFor: (item: InventoryItem) => bigint;
  /** True when this item would need a ninth slot. */
  full: (item: InventoryItem) => boolean;
  /** Why this room cannot take the item, or null when it can. */
  refuse?: (item: InventoryItem) => string | null;
  onAdd: (offer: Offer) => void;
  onClose: () => void;
}) {
  const ask = mode === "ask";
  const whose = ask ? "their wallet" : "your wallet";
  const ref = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const item = items?.find((i) => keyOf(i) === picked) ?? null;
  const meta = item ? assetMeta(item.kind, item.denom, tokens) : null;
  const stagedOf = (i: InventoryItem) => staged.find((o) => keyOf(o) === keyOf(i))?.amount ?? 0n;
  const searchable = (items?.length ?? 0) >= SEARCH_FROM;
  const q = query.trim().toLowerCase();
  const found = !items
    ? null
    : q
      ? items.filter((i) => {
          const m = assetMeta(i.kind, i.denom, tokens);
          return `${assetLabel(m)} ${m.name} ${m.symbol} ${i.denom}`.toLowerCase().includes(q);
        })
      : items;
  const shown = found && !q && !all ? found.slice(0, FIRST) : found;
  const hidden = (found?.length ?? 0) - (shown?.length ?? 0);
  const count = shown?.length ?? 0;
  // Four columns on a phone, six from 640 px: empty wells end each row.
  const phoneCells = fill(count, 4);
  const wideCells = fill(count, 6);
  const wells = Math.max(phoneCells, wideCells) - count;

  const close = () => {
    setPicked(null);
    setQuery("");
    setAll(false);
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="wallet-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] notch notch-lg slab bg-surface p-0 text-ink backdrop:bg-ground/80"
    >
      {open && (
        <div className="flex flex-col gap-7 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <h2 id="wallet-title" className="font-pixel text-[2.75rem] sm:text-[3.25rem]">
              {ask ? "Ask for" : practice ? "Your play wallet" : "Your wallet"}
            </h2>
            <Button variant="quiet" onClick={close}>
              Close
            </Button>
          </div>

          {error && !items && (
            <p className="text-[15px] text-alert">
              {ask ? "Their wallet" : "Your wallet"} could not be read. {error.message}
            </p>
          )}
          {loading && !items && <p className="text-[15px] text-muted">Reading {whose}…</p>}
          {ask && items && items.length === 0 && <p className="text-[15px] text-muted">Nothing a trade accepts is in their wallet.</p>}
          {!ask && items && items.length === 0 && (
            <p className="text-[15px] text-muted">
              Nothing a trade accepts is in this wallet yet.
              {!practice && !isMainnet && (
                <>
                  {" "}
                  Test GNOT on {network.name} is free from the{" "}
                  <a className="text-ink underline underline-offset-4" href="https://faucet.gno.land" target="_blank" rel="noreferrer">
                    faucet
                  </a>
                  .
                </>
              )}
            </p>
          )}

          {searchable && (
            <Field label={`Find in ${whose}`}>
              {({ id }) => (
                <Input
                  id={id}
                  type="search"
                  autoComplete="off"
                  placeholder="Name, symbol or realm path"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
            </Field>
          )}
          {found && q && found.length === 0 && (
            <p className="text-[15px] text-muted">
              Nothing in {whose} matches “{query.trim()}”.
            </p>
          )}

          {shown && count > 0 && (
            <ul className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
              {shown.map((i) => {
                const m = assetMeta(i.kind, i.denom, tokens);
                const key = keyOf(i);
                const held = { ...i, amount: i.balance >= ANY ? 0n : i.balance };
                const refused = refuse?.(i) ?? null;
                const tipId = `tip-wallet-${key.replace(/[^a-z0-9]/gi, "-")}`;
                return (
                  <li key={key} className="relative min-w-0">
                    <button
                      type="button"
                      onClick={() => setPicked(key)}
                      onMouseEnter={() => setTip(key)}
                      onMouseLeave={() => setTip((t) => (t === key ? null : t))}
                      onFocus={() => setTip(key)}
                      onBlur={() => setTip((t) => (t === key ? null : t))}
                      aria-pressed={picked === key}
                      aria-describedby={tip === key ? tipId : undefined}
                      aria-label={i.balance >= ANY ? `${assetLabel(m)}${refused ? ", not verified" : ""}` : `${itemName(held, m)} in ${whose}${refused ? ", not verified" : ""}`}
                      className={cx("relative block w-full notch transition-[filter] duration-150 hover:brightness-125", picked === key && "ring-2 ring-flint")}
                    >
                      <ItemIcon look={{ ...itemLook(held, m), side }} dim={!!refused} />
                      {i.balance < ANY && (
                        <span
                          aria-hidden
                          className="font-pixel text-shadow-count pointer-events-none absolute bottom-1 right-1.5 max-w-[calc(100%-0.5rem)] truncate text-[20px] text-ink sm:text-[22px]"
                        >
                          {slotCount(held, m)}
                        </span>
                      )}
                      {refused && (
                        <span aria-hidden className="text-shadow-count pointer-events-none absolute left-1.5 top-1 text-[12px] font-semibold text-alert">
                          Unverified
                        </span>
                      )}
                    </button>
                    {tip === key && i.balance < ANY && (
                      <ItemTooltip id={tipId} kind={i.kind} denom={i.denom} amount={i.balance} tokens={tokens} />
                    )}
                  </li>
                );
              })}
              {Array.from({ length: wells }, (_, k) => (
                <li key={`well-${k}`} aria-hidden className={cx(count + k >= phoneCells && "max-sm:hidden", count + k >= wideCells && "sm:hidden")}>
                  <EmptySlot />
                </li>
              ))}
            </ul>
          )}
          {hidden > 0 && (
            <Button variant="secondary" className="w-fit" onClick={() => setAll(true)}>
              Show all {found?.length}
            </Button>
          )}

          {item && meta && (
            refuse?.(item) ? (
              <div className="flex flex-col gap-2 notch bg-alert-bg p-4 text-[15px] text-alert">
                <p className="font-semibold">{assetLabel(meta)}</p>
                <p>{refuse(item)}</p>
                <p className="font-mono text-[12px] [overflow-wrap:anywhere]">{item.denom}</p>
              </div>
            ) : full(item) ? (
              <p className="notch bg-ground/55 p-4 text-[15px] text-muted">{ask ? "A price can ask for at most 8 items." : "Your offer is full. Take an item back first."}</p>
            ) : item.kind === "nft" ? (
              <div className="flex flex-col gap-4 notch bg-ground/55 p-4 sm:p-5">
                <p className="text-[15px] font-semibold">{assetLabel(meta)}</p>
                {stagedOf(item) > 0n && <p className="text-[14px] text-muted">{ask ? "Already in your price." : "Already in your offer."}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    disabled={stagedOf(item) > 0n}
                    onClick={() => {
                      onAdd({ kind: item.kind, denom: item.denom, amount: 1n });
                      close();
                    }}
                  >
                    {ask ? "Add to your price" : "Add to your offer"}
                  </Button>
                  <Button variant="quiet" onClick={() => setPicked(null)}>
                    Never mind
                  </Button>
                </div>
              </div>
            ) : (
              <AmountPicker
                key={picked ?? ""}
                meta={meta}
                verb={ask ? "ask" : "add"}
                max={item.balance >= ANY ? ANY : item.balance - stagedOf(item)}
                reserve={reserveFor(item)}
                reserveNote="Max keeps 2 GNOT for fees"
                confirmLabel={ask ? "Add to your price" : "Add to your offer"}
                onCancel={() => setPicked(null)}
                onConfirm={(amount) => {
                  onAdd({ kind: item.kind, denom: item.denom, amount });
                  close();
                }}
              />
            )
          )}
        </div>
      )}
    </dialog>
  );
}
