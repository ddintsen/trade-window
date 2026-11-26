// The realm's verified list, read once and looked up by asset class, the
// same way verified.gno does: an NFT counts by its collection.

import { nftParts } from "./assets";
import type { Asset, AssetKind, Verification } from "./types";

export function classOf(kind: AssetKind, denom: string): string {
  return kind === "nft" ? `nft:${nftParts(denom).collection}` : `${kind}:${denom}`;
}

export interface VerifiedList {
  /** Classes that count now. */
  active: Set<string>;
  /** Classes proposed and still waiting out the delay, with the time they start to count. */
  pending: Map<string, Verification>;
  /** Public reasons, by class. */
  reasons: Map<string, string>;
}

export function verifiedList(entries: Verification[], now: number): VerifiedList {
  const list: VerifiedList = { active: new Set(), pending: new Map(), reasons: new Map() };
  for (const v of entries) {
    const cls = `${v.kind}:${v.key}`;
    list.reasons.set(cls, v.reason);
    if (v.active || now >= v.since) list.active.add(cls);
    else list.pending.set(cls, v);
  }
  return list;
}

/** Whether an ordinary room takes this asset now. */
export function isVerified(list: VerifiedList | null, a: Pick<Asset, "kind" | "denom">): boolean | null {
  if (!list) return null;
  return list.active.has(classOf(a.kind, a.denom));
}

/** The want-list text the realm reads: one "kind amount denom" per line. */
export function wantText(items: { kind: AssetKind; denom: string; amount: bigint | string }[]): string {
  return items.map((a) => `${a.kind} ${String(a.amount)} ${a.denom}`).join("\n");
}
