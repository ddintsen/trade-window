// Reads from and messages for the rooms realm.

import { nftParts } from "./assets";
import { realms } from "./config";
import { call, tokenRealm } from "./messages";
import { goString, qevalJSON } from "./rpc";
import type { Asset, AssetKind, Room, RoomList, Stats, TokenInfo, Verification } from "./types";
import { wantText } from "./verified";

/** A GRC721 collection registered with the rooms realm. */
export interface CollectionInfo {
  key: string;
  name: string;
  symbol: string;
  /** Registered with its enumerable view: a wallet's tokens can be listed. */
  listed: boolean;
  /** Ordinary rooms take it. */
  verified?: boolean;
}

/** One NFT a wallet holds, and whether the rooms realm may move it. */
export interface OwnedNFT {
  key: string;
  name: string;
  symbol: string;
  tokenId: string;
  approved: boolean;
  owner?: string;
}

const R = () => realms.rooms;

export const roomsApi = {
  room: (id: number, signal?: AbortSignal) => qevalJSON<Room | null>(R(), `RoomJSON(${id})`, signal),
  roomsOf: (address: string, offset = 0, limit = 50, signal?: AbortSignal) =>
    qevalJSON<RoomList>(R(), `RoomsOfJSON(${goString(address)}, ${offset}, ${limit})`, signal),
  latest: (offset = 0, limit = 20, signal?: AbortSignal) =>
    qevalJSON<RoomList>(R(), `LatestJSON(${offset}, ${limit})`, signal),
  stats: (signal?: AbortSignal) => qevalJSON<Stats>(R(), "StatsJSON()", signal),
  tokens: async (signal?: AbortSignal) =>
    (await qevalJSON<{ tokens: TokenInfo[] }>(R(), "TokensJSON(0, 50)", signal)).tokens,
  token: (key: string, owner: string, signal?: AbortSignal) =>
    qevalJSON<TokenInfo | null>(R(), `TokenJSON(${goString(key)}, ${goString(owner)})`, signal),
  /** Registry tokens the owner holds; read on while more is true. */
  balances: (owner: string, offset = 0, limit = 50, signal?: AbortSignal) =>
    qevalJSON<{ tokens: TokenInfo[]; more: boolean } | null>(R(), `BalancesJSON(${goString(owner)}, ${offset}, ${limit})`, signal),
  collections: async (signal?: AbortSignal) =>
    (await qevalJSON<{ collections: CollectionInfo[]; more: boolean }>(R(), "CollectionsJSON(0, 50)", signal)).collections,
  /** NFTs the owner holds in listed collections; read on while more is true. */
  owned: (owner: string, offset = 0, limit = 50, signal?: AbortSignal) =>
    qevalJSON<{ nfts: OwnedNFT[]; more: boolean } | null>(R(), `OwnedJSON(${goString(owner)}, ${offset}, ${limit})`, signal),
  nft: (key: string, tokenId: string, signal?: AbortSignal) =>
    qevalJSON<OwnedNFT | null>(R(), `NFTJSON(${goString(key)}, ${goString(tokenId)})`, signal),
  /** Every verification, counting or waiting out its delay, with its public reason. */
  verified: async (signal?: AbortSignal) => {
    const all: Verification[] = [];
    let now = 0;
    // Twenty pages are a thousand entries; the list is kept short by policy.
    for (let page = 0, more = true; more && page < 20; page++) {
      const res = await qevalJSON<{ assets: Verification[]; more: boolean; now: number }>(R(), `VerifiedJSON(${page * 50}, 50)`, signal);
      all.push(...res.assets);
      now = res.now;
      more = res.more;
    }
    return { entries: all, now };
  },
};

interface DepositItem {
  kind: AssetKind;
  denom: string;
  amount: bigint;
  /** For an NFT: the rooms realm may already move it, so no Approve is needed. */
  approved?: boolean;
}

/** Coins for the send field: "5000000ugnot,10ufoo", sorted by denom. */
function coinsText(items: { denom: string; amount: bigint | string }[]): string {
  return [...items]
    .sort((a, b) => (a.denom < b.denom ? -1 : 1))
    .map((c) => `${c.amount}${c.denom}`)
    .join(",");
}

export const roomsTx = {
  /** An open-market room is a different function, so the wallet names the choice when it is signed. */
  open: (caller: string, counterparty: string, ttlMinutes: number, openMarket = false) =>
    [call(caller, R(), openMarket ? "OpenMarket" : "Open", [counterparty, ttlMinutes])],
  /** The maker's terms: their side as it is at this version, for exactly this list. */
  offer: (caller: string, id: number, version: number, want: { kind: AssetKind; denom: string; amount: bigint | string }[]) =>
    [call(caller, R(), "Offer", [id, version, wantText(want)])],
  /**
   * Accepting an offer in one transaction: an Approve for each wanted token
   * and NFT (unless the realm may already move it), then Fill with exactly
   * the wanted coins attached.
   */
  fill: (caller: string, id: number, version: number, want: (Asset & { approved?: boolean })[], realmAddress: string) => {
    const msgs = [];
    for (const a of want) {
      if (a.kind === "token") msgs.push(call(caller, tokenRealm(a.denom), "Approve", [realmAddress, a.amount]));
      if (a.kind === "nft" && !a.approved) {
        const { collection, id: tokenId } = nftParts(a.denom);
        msgs.push(call(caller, tokenRealm(collection), "Approve", [realmAddress, tokenId]));
      }
    }
    msgs.push(call(caller, R(), "Fill", [id, version], coinsText(want.filter((a) => a.kind === "coin"))));
    return msgs;
  },
  join: (caller: string, id: number) => [call(caller, R(), "Join", [id])],
  depositCoins: (caller: string, id: number, ugnot: bigint) =>
    [call(caller, R(), "DepositCoins", [id], `${ugnot}ugnot`)],
  /**
   * Several items in one transaction: every coin rides on one DepositCoins
   * call, each token gets its Approve and DepositToken pair, and each NFT
   * its collection's Approve (unless the realm may already move it) and
   * DepositNFT.
   */
  depositMany: (caller: string, id: number, items: DepositItem[], realmAddress: string) => {
    const coins = items.filter((i) => i.kind === "coin");
    const tokens = items.filter((i) => i.kind === "token");
    const nfts = items.filter((i) => i.kind === "nft");
    const msgs = [];
    if (coins.length) msgs.push(call(caller, R(), "DepositCoins", [id], coinsText(coins)));
    for (const t of tokens) {
      msgs.push(call(caller, tokenRealm(t.denom), "Approve", [realmAddress, t.amount]));
      msgs.push(call(caller, R(), "DepositToken", [id, t.denom, t.amount]));
    }
    for (const n of nfts) {
      const { collection, id: tokenId } = nftParts(n.denom);
      if (!n.approved) msgs.push(call(caller, tokenRealm(collection), "Approve", [realmAddress, tokenId]));
      msgs.push(call(caller, R(), "DepositNFT", [id, collection, tokenId]));
    }
    return msgs;
  },
  /** Approve and deposit in one transaction, so one signature moves the token. */
  depositToken: (caller: string, id: number, key: string, amount: bigint, realmAddress: string) => [
    call(caller, tokenRealm(key), "Approve", [realmAddress, amount]),
    call(caller, R(), "DepositToken", [id, key, amount]),
  ],
  withdrawCoins: (caller: string, id: number, denom: string, amount: bigint) =>
    [call(caller, R(), "WithdrawCoins", [id, denom, amount])],
  withdrawToken: (caller: string, id: number, key: string, amount: bigint) =>
    [call(caller, R(), "WithdrawToken", [id, key, amount])],
  withdrawNFT: (caller: string, id: number, denom: string) => {
    const { collection, id: tokenId } = nftParts(denom);
    return [call(caller, R(), "WithdrawNFT", [id, collection, tokenId])];
  },
  lock: (caller: string, id: number, version: number) => [call(caller, R(), "Lock", [id, version])],
  unlock: (caller: string, id: number) => [call(caller, R(), "Unlock", [id])],
  cancel: (caller: string, id: number) => [call(caller, R(), "Cancel", [id])],
};
