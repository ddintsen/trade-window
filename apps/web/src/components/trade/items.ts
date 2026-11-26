import type { ItemShape } from "@/components/three/item-mesh";
import { amountTier, assetLabel, compactUnits, formatUnits, type AssetMeta } from "@/lib/chain/assets";
import { WUGNOT_KEY } from "@/lib/chain/config";
import { itemPicture } from "@/lib/chain/token-logos";
import type { Asset } from "@/lib/chain/types";
import { classOf, type VerifiedList } from "@/lib/chain/verified";
import { when } from "@/lib/format";

export const SLOTS = 8; // the realm's MaxAssetsPerSide

export function keyOf(a: Pick<Asset, "kind" | "denom">): string {
  return `${a.kind}:${a.denom}`;
}

/** A native coin is a coin, wrapped GNOT a coin sealed in a cube, any other token a cube, an NFT a framed piece on a stand. */
export function itemShape(a: Pick<Asset, "kind" | "denom">): ItemShape {
  if (a.kind === "coin") return "coin";
  if (a.kind === "nft") return "nft";
  return a.denom === WUGNOT_KEY ? "wrapped" : "cube";
}

/**
 * Everything a picture of an item needs: its shape, the word or picture on
 * it, how big its pile is, and for an NFT its number.
 */
export function itemLook(a: Pick<Asset, "kind" | "denom"> & { amount: string | bigint }, meta: AssetMeta) {
  const nft = a.kind === "nft";
  return {
    shape: itemShape(a),
    symbol: glyphSymbol(meta),
    logo: itemPicture(a.kind, a.denom),
    tier: nft ? 0 : amountTier(a.amount, meta.decimals),
    badge: nft ? `#${meta.tokenId}` : "",
  };
}

/** The short name printed on an item's glass. */
export function glyphSymbol(meta: AssetMeta): string {
  if (meta.denom === WUGNOT_KEY) return "wGNOT";
  return meta.symbol;
}

/**
 * Tokens that call themselves GNOT but are not the coin or wrapped GNOT are
 * the classic swap scam; say so wherever such an item appears.
 */
export function looksLikeGnot(a: Pick<Asset, "kind" | "denom">, meta: AssetMeta): string | null {
  if (a.kind !== "token" || a.denom === WUGNOT_KEY) return null;
  return /^w?gnot$/i.test(meta.symbol.trim()) || /gnot/i.test(meta.name)
    ? "Calls itself GNOT, but it is a different token."
    : null;
}

type Amounted = Pick<Asset, "kind" | "denom"> & { amount: string | bigint };

/** What a slot shows in its corner: a short stack count, or an NFT's number. */
export function slotCount(a: Amounted, meta: AssetMeta): string {
  return a.kind === "nft" ? `#${meta.tokenId}` : compactUnits(a.amount, meta.decimals);
}

/** The item in words, exact: "500,000 MOSS", or "Gnome hats #12" for an NFT. */
export function itemName(a: Amounted, meta: AssetMeta): string {
  return a.kind === "nft" ? assetLabel(meta) : `${formatUnits(a.amount, meta.decimals)} ${assetLabel(meta)}`;
}

/** Where an item stands with the realm's verified list, in words. */
export interface Trust {
  verified: boolean;
  /** One line for a tooltip or a list: why it is verified, or why that matters. */
  line: string;
}

export function trustOf(a: Pick<Asset, "kind" | "denom">, list: VerifiedList | null): Trust | null {
  if (!list) return null;
  const cls = classOf(a.kind, a.denom);
  if (list.active.has(cls)) return { verified: true, line: `Verified. ${list.reasons.get(cls) ?? ""}`.trim() };
  const pending = list.pending.get(cls);
  if (pending) return { verified: false, line: `Not verified yet: it counts from ${when(pending.since)}, if nobody withdraws it.` };
  return { verified: false, line: "Not verified. Anyone can register a token or NFT under any name: check the full path." };
}
