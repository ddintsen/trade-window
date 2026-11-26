// Official token logos, from Onbloc's gno-token-resource (the list Adena,
// GnoScan and GnoSwap read; MIT). Matched by the realm the token lives in,
// so the same token shows the same face on every network. A token that is
// not on the list has no logo: it shows its symbol and nothing borrowed.

import { nftParts } from "./assets";
import type { AssetKind } from "./types";

const COINS: Record<string, string> = {
  ugnot: "/tokens/ugnot.svg",
};

/** Package path -> logo. Token keys are "<package path>.<symbol slug>". */
const PACKAGES: Record<string, string> = {
  "gno.land/r/gnoland/wugnot": "/tokens/wugnot.svg",
  "gno.land/r/demo/wugnot": "/tokens/wugnot.svg",
  "gno.land/r/gnoswap/gns": "/tokens/gns.svg",
  "gno.land/r/gnoswap/v1/gns": "/tokens/gns.svg",
  "gno.land/r/gnoswap/gov/xgns": "/tokens/xgns.svg",
  "gno.land/r/nym-thegnomic001/gnomic": "/tokens/gnomic.svg",
  "gno.land/r/g1leu8d2vsplhehcfkjg50mwgdpxdkt8tztu95wr/wbubble": "/tokens/bubble.svg",
  "gno.land/r/g1n4pl5uc4yt5r96m9w6fmdznx3x0jyg8l6arhmt/gnomi/padv3": "/tokens/gnomi.svg",
  "gno.land/r/gnoswap/test_token/test_btc": "/tokens/btc.svg",
  "gno.land/r/gnoswap/test_token/test_eth": "/tokens/eth.svg",
  "gno.land/r/gnoswap/test_token/test_usdc": "/tokens/usdc.svg",
  "gno.land/r/gnoswap/test_token/test_usdt": "/tokens/usdt.svg",
  "gno.land/r/gnoswap/test_token/test_atom": "/tokens/atom.svg",
  "gno.land/r/gnoswap/test_token/test_atone": "/tokens/atone.svg",
  "gno.land/r/gnoswap/test_token/test_photon": "/tokens/photon.svg",
  "gno.land/r/gnoswap/test_token/test_sol": "/tokens/sol.svg",
  "gno.land/r/gnoswap/test_token/test_trx": "/tokens/trx.svg",
  "gno.land/r/gnoswap/test_token/test_dai": "/tokens/dai.svg",
};

/** Tokens minted by a shared factory are told apart by their symbol slug. */
const KEYS: Record<string, string> = {
  "gno.land/r/demo/defi/grc20factory.PERUN": "/tokens/perun.svg",
};

export function tokenLogo(kind: AssetKind, denom: string): string | null {
  if (kind === "coin") return COINS[denom] ?? null;
  if (KEYS[denom]) return KEYS[denom];
  const dot = denom.lastIndexOf(".");
  const pkg = dot > 0 ? denom.slice(0, dot) : denom;
  return PACKAGES[pkg] ?? null;
}

/**
 * Pictures for NFT collections that have one. Only the practice venue's
 * play collections for now; a collection's own metadata image comes later.
 */
const COLLECTIONS: Record<string, string> = {
  "practice/hats": "/practice/hat.svg",
  "practice/lanterns": "/practice/lantern.svg",
};

export function nftPicture(denom: string): string | null {
  return COLLECTIONS[nftParts(denom).collection] ?? null;
}

/** The picture an item wears: a token's logo, or an NFT's picture. */
export function itemPicture(kind: AssetKind, denom: string): string | null {
  return kind === "nft" ? nftPicture(denom) : tokenLogo(kind, denom);
}
