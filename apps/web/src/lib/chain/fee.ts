// The service fee, computed exactly as the rooms realm does (fee.gno), so
// the window can show each side what arrives before anyone gets ready.

import type { Asset } from "./types";

/** The realm's cap: no room can settle with more than 1%. */
export const MAX_FEE_BPS = 100;

/** amount × bps / 10000, rounded down, without overflowing int64 on chain. */
export function feeOf(amount: bigint, bps: number): bigint {
  if (amount <= 0n || bps <= 0) return 0n;
  const b = BigInt(Math.min(Math.floor(bps), MAX_FEE_BPS));
  return (amount / 10000n) * b + ((amount % 10000n) * b) / 10000n;
}

/** What one asset pays and what arrives on the other side. NFTs cross whole and free. */
export function feeSplit(a: Pick<Asset, "kind" | "amount">, bps: number): { fee: bigint; net: bigint } {
  const amount = BigInt(a.amount);
  if (a.kind === "nft") return { fee: 0n, net: amount };
  const fee = feeOf(amount, bps);
  return { fee, net: amount - fee };
}

/** "0.5%" for 50 basis points. */
export function feePercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = String(bps % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}
