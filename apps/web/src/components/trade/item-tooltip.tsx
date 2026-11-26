"use client";

import { assetLabel, assetMeta, formatUnits, type AssetMeta } from "@/lib/chain/assets";
import { feePercent, feeSplit } from "@/lib/chain/fee";
import type { AssetKind, TokenInfo } from "@/lib/chain/types";
import { cx } from "@/lib/cx";
import { useLayoutEffect, useRef } from "react";
import { Path } from "@/components/ui/path";
import { itemName, looksLikeGnot, type Trust } from "./items";

/** What kind of item it is, with a token's own name when its symbol does not say it. */
function kindLine(kind: AssetKind, meta: AssetMeta): string {
  if (kind === "coin") return "Native coin";
  if (kind === "nft") return "NFT";
  const name = meta.name.trim().toLowerCase();
  return name && name !== assetLabel(meta).toLowerCase() && name !== meta.symbol.toLowerCase() ? `${meta.name}, a GRC20 token` : "GRC20 token";
}

const GAP = 10;
const MARGIN = 8;

/**
 * Keeps a tooltip in the top layer, above its slot (below when there is no
 * room above), inside the viewport. The window's panels and dialogs have
 * stepped corners cut with clip-path, which would cut off anything that
 * reaches past them; the top layer is drawn over everything, dialogs
 * included.
 */
function useTopLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = el?.parentElement;
    if (!el || !anchor) return;
    if (typeof el.showPopover === "function") {
      try {
        el.showPopover();
      } catch {
        // Already shown, or popovers are not supported: it stays in place.
      }
    }
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const above = a.top - GAP - h;
      const top = above >= MARGIN ? above : a.bottom + GAP;
      const left = Math.min(Math.max(a.left + a.width / 2 - w / 2, MARGIN), vw - w - MARGIN);
      el.style.top = `${Math.round(top)}px`;
      el.style.left = `${Math.round(left)}px`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      try {
        el.hidePopover?.();
      } catch {
        // Gone with its slot.
      }
    };
  }, []);
  return ref;
}

/**
 * An item's tooltip, the way a game shows one over an inventory slot: the
 * exact amount, what it is, where it comes from, and the warning when a
 * token only calls itself GNOT. The one place a token's full path is
 * spelled out. Render it as the last child of the slot's wrapper: that
 * wrapper is what it lines up with.
 */
export function ItemTooltip({
  id,
  kind,
  denom,
  amount,
  tokens,
  trust,
  feeBps,
  className,
}: {
  id: string;
  kind: AssetKind;
  denom: string;
  amount: bigint;
  tokens: Map<string, TokenInfo>;
  /** Where it stands with the verified list; omitted where that is not known. */
  trust?: Trust | null;
  /** On the side you receive: the room's fee, to say what arrives. */
  feeBps?: number;
  className?: string;
}) {
  const meta = assetMeta(kind, denom, tokens);
  const warn = looksLikeGnot({ kind, denom }, meta);
  const ref = useTopLayer();
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      popover="manual"
      className={cx(
        "pointer-events-none fixed inset-auto m-0 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1.5 overflow-visible border-0 notch bg-raise p-4 text-left text-ink shadow-none",
        className,
      )}
    >
      <p className="tabular text-[15px] font-semibold leading-tight [overflow-wrap:anywhere]">{itemName({ kind, denom, amount }, meta)}</p>
      <p className="text-[13px] text-muted">{kindLine(kind, meta)}</p>
      {kind !== "coin" && (
        <p className="font-mono text-[12px] text-muted [overflow-wrap:anywhere]">
          <Path value={kind === "nft" ? `${meta.collection} #${meta.tokenId}` : denom} />
        </p>
      )}
      {warn && <p className="text-[13px] font-medium text-alert">{warn}</p>}
      {trust && <p className={cx("text-[13px]", trust.verified ? "text-muted" : "font-medium text-alert")}>{trust.line}</p>}
      {feeBps !== undefined && kind !== "nft" && feeBps > 0 && (
        <p className="tabular text-[13px] text-muted">
          You receive {formatUnits(feeSplit({ kind, amount: String(amount) }, feeBps).net, meta.decimals)} after the {feePercent(feeBps)} fee.
        </p>
      )}
    </div>
  );
}
