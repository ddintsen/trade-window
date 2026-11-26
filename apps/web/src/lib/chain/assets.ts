// How assets are named and how base units become readable amounts.

import { WUGNOT_KEY } from "./config";
import type { Asset, AssetKind, TokenInfo } from "./types";

export interface AssetMeta {
  kind: AssetKind;
  denom: string;
  symbol: string;
  name: string;
  decimals: number;
  /** One line for people who want to know exactly what this is. */
  detail: string;
  /** For an NFT: its collection's key and its own id. */
  collection?: string;
  tokenId?: string;
}

/** An NFT's asset denom is its collection key, "#" and its token id; keys never hold "#". */
export function nftParts(denom: string): { collection: string; id: string } {
  const i = denom.indexOf("#");
  return i < 0 ? { collection: denom, id: "" } : { collection: denom.slice(0, i), id: denom.slice(i + 1) };
}

export const nftDenom = (collection: string, id: string) => `${collection}#${id}`;

const UGNOT: AssetMeta = {
  kind: "coin",
  denom: "ugnot",
  symbol: "GNOT",
  name: "GNOT",
  decimals: 6,
  detail: "Native coin, sent with the call",
};

/**
 * Wrapped GNOT counts in ugnot (its token declares 0 decimals and the
 * symbol "wugnot"), so it is shown in GNOT units like the native coin.
 */
const WUGNOT: AssetMeta = {
  kind: "token",
  denom: WUGNOT_KEY,
  symbol: "GNOT",
  name: "Wrapped GNOT",
  decimals: 6,
  detail: "GRC20 wugnot, one unit per ugnot",
};

export function assetMeta(kind: AssetKind, denom: string, tokens?: Map<string, TokenInfo>): AssetMeta {
  if (kind === "nft") {
    const { collection, id } = nftParts(denom);
    const info = tokens?.get(collection);
    const fallback = collection.slice(collection.lastIndexOf("/") + 1) || collection;
    return {
      kind,
      denom,
      symbol: info?.symbol ?? fallback,
      name: info?.name ?? fallback,
      decimals: 0,
      detail: `GRC721 ${collection}`,
      collection,
      tokenId: id,
    };
  }
  if (kind === "coin") {
    if (denom === "ugnot") return UGNOT;
    return { kind, denom, symbol: denom, name: denom, decimals: 0, detail: "Native coin" };
  }
  if (denom === WUGNOT_KEY) return WUGNOT;
  const info = tokens?.get(denom);
  if (info) {
    return {
      kind,
      denom,
      symbol: info.symbol,
      name: info.name,
      decimals: info.decimals,
      detail: `GRC20 ${denom}`,
    };
  }
  const symbol = denom.includes(".") ? denom.slice(denom.lastIndexOf(".") + 1) : denom;
  return { kind, denom, symbol, name: symbol, decimals: 0, detail: `GRC20 ${denom}` };
}

/** Wrapped assets get a qualifier so they are never confused with the coin; an NFT is its collection and number. */
export function assetLabel(meta: AssetMeta): string {
  if (meta.kind === "nft") return `${meta.name} #${meta.tokenId}`;
  return meta.denom === WUGNOT_KEY ? "wrapped GNOT" : meta.symbol;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 2500000 with 6 decimals -> "2.5"; keeps every significant digit. */
export function formatUnits(base: string | bigint, decimals: number): string {
  let s = typeof base === "bigint" ? base.toString() : base;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  if (!/^\d+$/.test(s)) return String(base);
  if (decimals <= 0) return (negative ? "-" : "") + group(s.replace(/^0+(?=\d)/, ""));
  s = s.padStart(decimals + 1, "0");
  const whole = group(s.slice(0, -decimals).replace(/^0+(?=\d)/, ""));
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return (negative ? "-" : "") + (frac ? `${whole}.${frac}` : whole);
}

/** "2.5" with 6 decimals -> 2500000n; null when the input is not a valid amount. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const text = input.trim().replace(/[,_\s]/g, "");
  if (!/^\d*(\.\d*)?$/.test(text) || text === "" || text === ".") return null;
  const [whole = "", frac = ""] = text.split(".");
  if (frac.length > decimals) return null;
  const value = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac || "").padEnd(decimals, "0") || "0");
  return value;
}

const SUFFIXES: [bigint, string][] = [
  [10n ** 12n, "T"],
  [10n ** 9n, "B"],
  [10n ** 6n, "M"],
  [10n ** 3n, "K"],
];

/**
 * A stack count for a slot, as games show one: 500000 -> "500K",
 * 1299999 -> "1.2M", 12.345 -> "12.34". Always rounded down, so a slot
 * never shows more than is there; the exact amount is in the tooltip.
 */
export function compactUnits(base: string | bigint, decimals: number): string {
  const v = typeof base === "bigint" ? base : BigInt(base);
  if (v < 0n) return formatUnits(v, decimals);
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  if (whole >= 10_000n) {
    for (const [size, suffix] of SUFFIXES) {
      if (whole < size) continue;
      const tenths = (v * 10n) / (unit * size);
      const head = tenths / 10n;
      const tenth = tenths % 10n;
      return head >= 100n || tenth === 0n ? `${group(head.toString())}${suffix}` : `${head}.${tenth}${suffix}`;
    }
  }
  // Below ten thousand: two decimals under 100, one under 1000, none above.
  const places = whole >= 1000n ? 0 : whole >= 100n ? 1 : whole >= 1n ? 2 : -1;
  if (places >= 0) {
    const keep = BigInt(Math.max(0, decimals - places));
    const cut = decimals > places ? (v / 10n ** keep) * 10n ** keep : v;
    return formatUnits(cut, decimals);
  }
  // Under one: the first two significant digits.
  const digits = v.toString().length;
  const keep = BigInt(Math.max(0, digits - 2));
  return formatUnits((v / 10n ** keep) * 10n ** keep, decimals);
}

/** How large a pile looks in the scene: a piece, a stack, two stacks, a heap. */
export function amountTier(base: string | bigint, decimals: number): 0 | 1 | 2 | 3 {
  const whole = (typeof base === "bigint" ? base : BigInt(base)) / 10n ** BigInt(decimals);
  if (whole < 10n) return 0;
  if (whole < 1000n) return 1;
  if (whole < 100_000n) return 2;
  return 3;
}

export function formatAsset(asset: Asset, tokens?: Map<string, TokenInfo>): { amount: string; meta: AssetMeta } {
  const meta = assetMeta(asset.kind, asset.denom, tokens);
  return { amount: formatUnits(asset.amount, meta.decimals), meta };
}

/** "10 GNOT and 25 wrapped GNOT"; "nothing" for an empty side. */
export function assetsSummary(assets: Asset[], tokens?: Map<string, TokenInfo>, empty = "nothing"): string {
  if (assets.length === 0) return empty;
  const parts = assets.map((a) => {
    const { amount, meta } = formatAsset(a, tokens);
    return meta.kind === "nft" ? assetLabel(meta) : `${amount} ${assetLabel(meta)}`;
  });
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export const MAX_INT64 = 9223372036854775807n;
