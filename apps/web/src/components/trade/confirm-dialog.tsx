"use client";

import { useEffect, useRef } from "react";
import { assetLabel, formatAsset, formatUnits } from "@/lib/chain/assets";
import { gnowebUrl, realms } from "@/lib/chain/config";
import { feePercent, feeSplit } from "@/lib/chain/fee";
import type { Asset, TokenInfo } from "@/lib/chain/types";
import type { VerifiedList } from "@/lib/chain/verified";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/button";
import { Path } from "@/components/ui/path";
import { ItemIcon } from "./item-tile";
import { itemLook, keyOf, looksLikeGnot, trustOf } from "./items";

type SideName = "maker" | "taker";

/** What the signature does: get ready, complete the trade, put up a price, or accept one. */
export type ConfirmMode = "ready" | "trade" | "price" | "fill";

const TITLES: Record<ConfirmMode, (v: number) => string> = {
  ready: (v) => `Get ready on version ${v}`,
  trade: () => "Complete the trade",
  price: () => "Put up your price",
  fill: () => "Accept their price",
};

const LEADS: Record<ConfirmMode, string> = {
  ready: "Nothing moves yet. If either side changes, your ready mark clears.",
  trade: "Both sides swap in one transaction. It cannot be undone.",
  price: "They can accept it in one step, and the trade completes at once. Change anything in the room and the price comes down.",
  fill: "You put in what they ask for and the trade completes in the same transaction. It cannot be undone.",
};

const ACTIONS: Record<ConfirmMode, string> = { ready: "I am ready", trade: "Trade", price: "Put up this price", fill: "Accept and trade" };

/**
 * The second screen of a trade: everything both sides give, in full, with
 * what arrives after the fee, whether each item is verified, and what the
 * wallet will ask you to sign. Nothing can be added here; going back
 * changes nothing.
 */
export function ConfirmDialog({
  open,
  mode,
  roomId,
  version,
  side,
  give,
  get,
  changed,
  tokens,
  verified,
  openMarket,
  feeBps,
  practice,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  mode: ConfirmMode;
  roomId: number;
  version: number;
  /** Your side, for the colours. */
  side: SideName;
  give: Asset[];
  get: Asset[];
  /** Keys of their items that changed since you last looked. */
  changed: Set<string>;
  tokens: Map<string, TokenInfo>;
  verified: VerifiedList | null;
  openMarket: boolean;
  feeBps: number;
  practice: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const theirs: SideName = side === "maker" ? "taker" : "maker";

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const call = mode === "fill" ? `Fill(${roomId}, ${version})` : mode === "price" ? `Offer(${roomId}, ${version}, …)` : `Lock(${roomId}, ${version})`;
  const approvals = mode === "fill" ? give.filter((a) => a.kind !== "coin").length : 0;
  const coins = mode === "fill" ? give.filter((a) => a.kind === "coin") : [];

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto max-h-[calc(100svh-2rem)] w-[min(46rem,calc(100vw-2rem))] notch notch-lg slab bg-surface p-0 text-ink backdrop:bg-ground/80"
    >
      {open && (
        <div className="flex flex-col gap-7 p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <h2 id="confirm-title" className="font-pixel text-[2.75rem] sm:text-[3.25rem]">
              {TITLES[mode](version)}
            </h2>
            <p className="max-w-[36rem] text-[15px] text-muted">{LEADS[mode]}</p>
          </div>

          {openMarket && (
            <p className="notch bg-alert-bg p-4 text-[15px] text-alert">
              Open market: nobody has checked these items. Compare each full path with what you agreed before you sign.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <List title="You give" side={side} assets={give} tokens={tokens} verified={verified} changed={new Set()} feeBps={feeBps} receiver="they" />
            <List title={mode === "price" ? "You ask for" : "You get"} side={theirs} assets={get} tokens={tokens} verified={verified} changed={changed} feeBps={feeBps} receiver="you" />
          </div>

          <div className="flex flex-col gap-2 text-[14px] text-muted">
            <p>
              {feeBps > 0
                ? `The service keeps ${feePercent(feeBps)} of each coin and token that crosses, from both sides, rounded down. NFTs cross whole and free.`
                : "This room settles without a service fee."}
            </p>
            {practice ? (
              <p>Practice: nothing is signed and nothing touches a chain.</p>
            ) : (
              <p>
                Adena will ask you to sign <span className="font-mono text-ink">{call}</span>
                {approvals > 0 && <> with {approvals === 1 ? "one approval" : `${approvals} approvals`} for what it takes</>}
                {coins.length > 0 && <> and {coins.map((c) => formatAsset(c, tokens)).map(({ amount, meta }) => `${amount} ${assetLabel(meta)}`).join(" and ")} attached</>} on{" "}
                <span className="font-mono text-ink [overflow-wrap:anywhere]">
                  <Path value={realms.rooms} />
                </span>
                .{" "}
                {mode !== "price" && (
                  <>
                    <a className="text-ink underline underline-offset-4" href={gnowebUrl(realms.rooms, `room/${roomId}`)} target="_blank" rel="noreferrer">
                      See version {version} as the contract shows it
                    </a>
                    .
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="quiet" size="lg" onClick={onCancel} disabled={busy}>
              Back to the window
            </Button>
            <Button variant="primary" size="lg" busy={busy} busyLabel={practice ? "Working…" : "Confirm in your wallet…"} onClick={onConfirm} autoFocus>
              {ACTIONS[mode]}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function List({
  title,
  side,
  assets,
  tokens,
  verified,
  changed,
  feeBps,
  receiver,
}: {
  title: string;
  side: SideName;
  assets: Asset[];
  tokens: Map<string, TokenInfo>;
  verified: VerifiedList | null;
  changed: Set<string>;
  feeBps: number;
  /** Who receives this list: "you" for what you get, "they" for what you give. */
  receiver: "you" | "they";
}) {
  return (
    <section className={cx("flex flex-col gap-4 notch p-4 sm:p-5", side === "maker" ? "bg-maker-bg" : "bg-taker-bg")}>
      <h3 className={cx("font-pixel text-[1.75rem]", side === "maker" ? "text-maker" : "text-taker")}>{title}</h3>
      <ul className="flex flex-col gap-4">
        {assets.map((a) => {
          const { amount, meta } = formatAsset(a, tokens);
          const key = keyOf(a);
          const warn = looksLikeGnot(a, meta);
          const trust = trustOf(a, verified);
          const { fee, net } = feeSplit(a, feeBps);
          return (
            <li key={key} className="flex items-start gap-3">
              <span className="w-14 shrink-0">
                <ItemIcon look={{ ...itemLook(a, meta), side }} size="sm" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 pt-1">
                <span className={cx("flex flex-wrap items-baseline gap-x-2", changed.has(key) && "text-alert")}>
                  {meta.kind === "nft" ? (
                    <span className="text-lg font-semibold">{assetLabel(meta)}</span>
                  ) : (
                    <>
                      <span className="tabular break-all text-lg font-semibold">{amount}</span>
                      <span>{assetLabel(meta)}</span>
                    </>
                  )}
                  {changed.has(key) && <span className="text-sm">changed</span>}
                </span>
                {fee > 0n && (
                  <span className="tabular text-[13px] text-muted">
                    {receiver === "you" ? "You receive" : "They receive"} {formatUnits(net, meta.decimals)}
                  </span>
                )}
                <span className="text-[13px] text-muted [overflow-wrap:anywhere]">
                  {meta.kind === "coin" ? (meta.denom === "ugnot" ? "Native coin" : `Native coin ${meta.denom}`) : <Path value={meta.kind === "nft" ? (meta.collection ?? "") : a.denom} />}
                </span>
                {warn && <span className="text-[13px] font-medium text-alert">{warn}</span>}
                {trust && !trust.verified && <span className="text-[13px] font-medium text-alert">{trust.line}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
