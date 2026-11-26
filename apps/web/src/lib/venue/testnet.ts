// Rooms on the deployed realm, signed with Adena.

import { nftDenom, nftParts } from "@/lib/chain/assets";
import { roomsApi, roomsTx } from "@/lib/chain/rooms";
import { coinBalances, parseTypedValue } from "@/lib/chain/rpc";
import type { CallMessage } from "@/lib/chain/messages";
import { sendCalls, WalletError } from "@/lib/wallet/adena";
import { wallet } from "@/lib/wallet/store";
import type { InventoryItem, Venue } from "./types";

function me(): string {
  const account = wallet.snapshot().account;
  if (!account) throw new WalletError("Connect Adena first.", "missing");
  return account.address;
}

let realmAddress = "";
async function roomsRealmAddress(): Promise<string> {
  if (!realmAddress) realmAddress = (await roomsApi.stats()).address;
  return realmAddress;
}

async function send(messages: CallMessage[]) {
  return sendCalls(messages);
}

export const testnetVenue: Venue = {
  kind: "testnet",
  base: "/trade",

  room: (id, signal) => roomsApi.room(id, signal),
  roomsOf: (address, signal) => roomsApi.roomsOf(address, 0, 50, signal),
  async tokens(signal) {
    const [tokens, collections] = await Promise.all([roomsApi.tokens(signal), roomsApi.collections(signal).catch(() => [])]);
    return [...tokens, ...collections.map((c) => ({ key: c.key, name: c.name, symbol: c.symbol, decimals: 0, nft: true, verified: c.verified }))];
  },
  verified: (signal) => roomsApi.verified(signal),
  feeBps: async (signal) => (await roomsApi.stats(signal)).feeBps,

  async balance(address, kind, denom, signal) {
    if (kind === "coin") {
      const coins = await coinBalances(address, signal);
      return { balance: BigInt(coins[denom] ?? "0") };
    }
    if (kind === "nft") {
      const { collection, id } = nftParts(denom);
      const nft = await roomsApi.nft(collection, id, signal);
      return { balance: nft?.owner === address ? 1n : 0n };
    }
    const info = await roomsApi.token(denom, address, signal);
    return { balance: BigInt(info?.balance ?? "0"), allowance: BigInt(info?.allowance ?? "0") };
  },

  async inventory(address, signal) {
    const items: InventoryItem[] = [];
    const coins = await coinBalances(address, signal);
    for (const [denom, amount] of Object.entries(coins)) {
      const balance = BigInt(amount);
      if (balance > 0n) items.push({ kind: "coin", denom, balance });
    }
    // Ten pages cover 500 registry entries; more than that is not a wallet a person reads.
    for (let page = 0, more = true; more && page < 10; page++) {
      const res = await roomsApi.balances(address, page * 50, 50, signal);
      if (!res) break;
      for (const t of res.tokens) items.push({ kind: "token", denom: t.key, balance: BigInt(t.balance ?? "0") });
      more = res.more;
    }
    // NFTs from collections that can list a wallet's tokens.
    for (let page = 0, more = true; more && page < 10; page++) {
      const res = await roomsApi.owned(address, page * 50, 50, signal).catch(() => null);
      if (!res) break;
      for (const n of res.nfts) items.push({ kind: "nft", denom: nftDenom(n.key, n.tokenId), balance: 1n });
      more = res.more;
    }
    const order = { coin: 0, token: 1, nft: 2 } as const;
    return items.sort((a, b) => order[a.kind] - order[b.kind] || (a.kind === "nft" ? (a.denom < b.denom ? -1 : 1) : b.balance > a.balance ? 1 : -1));
  },

  async open(counterparty, ttlMinutes, openMarket = false) {
    const caller = me();
    const receipt = await send(roomsTx.open(caller, counterparty, ttlMinutes, openMarket));
    try {
      const { literal } = parseTypedValue(receipt.returned);
      const id = Number(literal);
      if (Number.isSafeInteger(id) && id > 0) return id;
    } catch {
      // older wallets do not pass the return value through
    }
    const mine = await roomsApi.roomsOf(caller, 0, 1);
    const newest = mine.rooms[0];
    if (!newest || newest.maker.address !== caller) {
      throw new WalletError("The room was opened, but this page could not find it yet. Check Your rooms.", "unknown-outcome");
    }
    return newest.id;
  },
  async join(id) {
    await send(roomsTx.join(me(), id));
  },
  async offer(id, version, want) {
    await send(roomsTx.offer(me(), id, version, want));
  },
  async fill(id, version) {
    const caller = me();
    const room = await roomsApi.room(id);
    if (!room || room.version !== version || room.want.length === 0) {
      throw new Error("The offer changed. Look at it again before filling.");
    }
    // An NFT the realm may already move needs no Approve in the transaction.
    const want = await Promise.all(
      room.want.map(async (a) => {
        if (a.kind !== "nft") return a;
        const { collection, id: tokenId } = nftParts(a.denom);
        const nft = await roomsApi.nft(collection, tokenId);
        if (!nft || nft.owner !== caller) throw new Error(`The offer wants ${collection.slice(collection.lastIndexOf("/") + 1)} #${tokenId}, and it is not in your wallet.`);
        return { ...a, approved: nft.approved };
      }),
    );
    await send(roomsTx.fill(caller, id, version, want, await roomsRealmAddress()));
  },
  async depositMany(id, items) {
    if (items.length === 0) return;
    const caller = me();
    // An NFT the realm may already move needs no Approve in the transaction.
    const ready = await Promise.all(
      items.map(async (i) => {
        if (i.kind !== "nft") return i;
        const { collection, id: tokenId } = nftParts(i.denom);
        const nft = await roomsApi.nft(collection, tokenId);
        if (!nft || nft.owner !== caller) throw new Error("That NFT is not in your wallet any more.");
        return { ...i, approved: nft.approved };
      }),
    );
    await send(roomsTx.depositMany(caller, id, ready, await roomsRealmAddress()));
  },
  async depositCoins(id, ugnot) {
    await send(roomsTx.depositCoins(me(), id, ugnot));
  },
  async depositToken(id, key, amount) {
    await send(roomsTx.depositToken(me(), id, key, amount, await roomsRealmAddress()));
  },
  async withdraw(id, asset, amount) {
    const caller = me();
    if (asset.kind === "nft") {
      await send(roomsTx.withdrawNFT(caller, id, asset.denom));
      return;
    }
    await send(
      asset.kind === "coin"
        ? roomsTx.withdrawCoins(caller, id, asset.denom, amount)
        : roomsTx.withdrawToken(caller, id, asset.denom, amount),
    );
  },
  async lock(id, version) {
    const receipt = await send(roomsTx.lock(me(), id, version));
    return /settled/.test(receipt.returned) ? "settled" : "locked";
  },
  async unlock(id) {
    await send(roomsTx.unlock(me(), id));
  },
  async cancel(id) {
    await send(roomsTx.cancel(me(), id));
  },
};
