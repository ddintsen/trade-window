"use client";

// Practice rooms: the realm's rules, run in this browser with play
// balances and a scripted counterparty. Nothing here touches a chain.

import { WUGNOT_KEY } from "@/lib/chain/config";
import { MAX_INT64 } from "@/lib/chain/assets";
import { feeSplit } from "@/lib/chain/fee";
import { classOf } from "@/lib/chain/verified";
import type { Asset, AssetKind, Room, Side, TokenInfo, Verification } from "@/lib/chain/types";
import { lockedNow } from "@/lib/chain/types";
import { clearPracticeChat, gnomeSays } from "@/lib/chat/practice";
import { PRACTICE_ME, PRACTICE_PARTNER } from "./seats";
import type { Offer, Venue } from "./types";

export { PRACTICE_ME, PRACTICE_PARTNER };
/** Where practice fees go, so balances still add up. */
export const PRACTICE_TREASURY = "practice:treasury";
/** The realm's default rate: 0.5%. */
export const PRACTICE_FEE_BPS = 50;

const KEY = "tw.practice.v2";
const MAX_ASSETS = 8;
const GNOT = 1_000_000n;

/** Play goods: a token with a big balance, and two NFT collections. Practice only. */
export const MOSS_KEY = "practice/moss";
export const HATS = "practice/hats";
export const LANTERNS = "practice/lanterns";
/** A token nobody verified: only open-market rooms take it. */
export const PEBBLES_KEY = "practice/pebbles";
const nft = (collection: string, id: string) => `nft:${collection}#${id}`;

/** The practice verified list: everything but Pebbles, all counting already. */
const PRACTICE_VERIFIED: Verification[] = [
  { kind: "coin", key: "ugnot", reason: "The native coin of gno.land.", since: 0, active: true },
  { kind: "token", key: WUGNOT_KEY, reason: "GNOT wrapped one to one by a realm with no admin.", since: 0, active: true },
  { kind: "token", key: MOSS_KEY, reason: "Practice token with a fixed supply.", since: 0, active: true },
  { kind: "nft", key: HATS, reason: "Practice collection; its realm cannot burn or move holders' hats.", since: 0, active: true },
  { kind: "nft", key: LANTERNS, reason: "Practice collection; its realm cannot burn or move holders' lanterns.", since: 0, active: true },
];
const verifiedClasses = new Set(PRACTICE_VERIFIED.map((v) => `${v.kind}:${v.key}`));

interface PracticeState {
  nextId: number;
  rooms: Room[];
  balances: Record<string, Record<string, string>>;
  script: Record<number, { deposited?: boolean; nudged?: boolean; filling?: boolean; waitForOffer?: boolean }>;
}

function fresh(): PracticeState {
  return {
    nextId: 1,
    rooms: [],
    balances: {
      [PRACTICE_ME]: {
        "coin:ugnot": String(1000n * GNOT),
        [`token:${WUGNOT_KEY}`]: String(200n * GNOT),
        [`token:${MOSS_KEY}`]: String(500_000n * GNOT),
        [`token:${PEBBLES_KEY}`]: String(2_000n * GNOT),
        [nft(HATS, "12")]: "1",
        [nft(LANTERNS, "3")]: "1",
      },
      [PRACTICE_PARTNER]: {
        "coin:ugnot": String(1000n * GNOT),
        [`token:${WUGNOT_KEY}`]: String(1000n * GNOT),
        [`token:${MOSS_KEY}`]: String(100_000n * GNOT),
        [nft(LANTERNS, "7")]: "1",
        [nft(HATS, "5")]: "1",
      },
    },
    script: {},
  };
}

let state: PracticeState | null = null;
const listeners = new Set<() => void>();

function load(): PracticeState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? (JSON.parse(raw) as PracticeState) : fresh();
    // Rooms saved before offers and the fee existed.
    for (const r of state.rooms) {
      r.openMarket ??= false;
      r.want ??= [];
      r.feeBps ??= 0;
    }
  } catch {
    state = fresh();
  }
  return state;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // practice still works for this visit without storage
  }
  listeners.forEach((l) => l());
}

export function subscribePractice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetPractice() {
  state = fresh();
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  clearPracticeChat();
  save();
}

const nowSec = () => Math.floor(Date.now() / 1000);

function snapshot(room: Room): Room {
  const now = nowSec();
  return {
    ...structuredClone(room),
    expired: room.status === "open" && now >= room.expiresAt,
    now,
  };
}

function find(id: number): Room {
  const room = load().rooms.find((r) => r.id === id);
  if (!room) throw new Error("room not found");
  return room;
}

function sideOf(room: Room, who: string): [Side, Side] {
  if (who === room.maker.address) return [room.maker, room.taker];
  if (room.taker.address !== "" && who === room.taker.address) return [room.taker, room.maker];
  throw new Error("only the two parties of this room can do that");
}

function assertOpen(room: Room) {
  if (room.status !== "open") throw new Error(`this room is ${room.status}`);
}

function assertLive(room: Room) {
  assertOpen(room);
  if (nowSec() >= room.expiresAt) throw new Error("this room has expired: withdraw or cancel to get deposits back");
}

/** Every change raises the version and withdraws a standing offer. */
function bump(room: Room) {
  room.version++;
  room.want = [];
}

function assertAccepts(room: Room, kind: AssetKind, denom: string) {
  if (room.openMarket || verifiedClasses.has(classOf(kind, denom))) return;
  throw new Error(`this room takes only verified assets, and ${denom} is not verified: trade it in an open-market room`);
}

const balKey = (kind: AssetKind, denom: string) => `${kind}:${denom}`;

function balanceOf(who: string, kind: AssetKind, denom: string): bigint {
  return BigInt(load().balances[who]?.[balKey(kind, denom)] ?? "0");
}

function move(who: string, kind: AssetKind, denom: string, delta: bigint) {
  const s = load();
  const next = balanceOf(who, kind, denom) + delta;
  if (next < 0n) {
    throw new Error(kind === "coin" ? "insufficient coins" : kind === "nft" ? "you do not own that NFT" : "insufficient token balance");
  }
  s.balances[who] = { ...(s.balances[who] ?? {}), [balKey(kind, denom)]: String(next) };
}

function addAsset(side: Side, kind: AssetKind, denom: string, amount: bigint) {
  const existing = side.assets.find((a) => a.kind === kind && a.denom === denom);
  if (existing) {
    const total = BigInt(existing.amount) + amount;
    if (total > MAX_INT64) throw new Error("amount is too large");
    existing.amount = String(total);
    return;
  }
  if (side.assets.length >= MAX_ASSETS) throw new Error("a side can hold at most 8 different assets");
  side.assets.push({ kind, denom, amount: String(amount) });
}

function subAsset(side: Side, kind: AssetKind, denom: string, amount: bigint) {
  const i = side.assets.findIndex((a) => a.kind === kind && a.denom === denom);
  if (i < 0) throw new Error("you have not deposited that asset");
  const have = BigInt(side.assets[i].amount);
  if (amount > have) throw new Error("you have less than that in the room");
  if (have === amount) side.assets.splice(i, 1);
  else side.assets[i].amount = String(have - amount);
}

function payout(to: string, assets: Asset[]) {
  for (const a of assets) move(to, a.kind, a.denom, BigInt(a.amount));
}

/** Settlement pays each side the other's assets, less the room's fee on coins and tokens. */
function pay(room: Room, to: string, assets: Asset[]) {
  for (const a of assets) {
    const { fee, net } = feeSplit(a, room.feeBps);
    if (fee > 0n) move(PRACTICE_TREASURY, a.kind, a.denom, fee);
    move(to, a.kind, a.denom, net);
  }
}

function settle(room: Room, who: string) {
  room.status = "settled";
  room.closedAt = nowSec();
  room.closedBy = who;
  pay(room, room.taker.address, room.maker.assets);
  pay(room, room.maker.address, room.taker.assets);
}

// The engine, called as either party.

function open(who: string, counterparty: string, ttlMinutes: number, openMarket = false): number {
  const ttl = ttlMinutes === 0 ? 24 * 60 : ttlMinutes;
  if (ttl < 10 || ttl > 7 * 24 * 60) throw new Error("room lifetime must be between 10 minutes and 7 days");
  const cp = counterparty.trim();
  if (cp === who) throw new Error("you cannot open a room with yourself");
  if (cp !== "" && cp !== PRACTICE_PARTNER && cp !== PRACTICE_ME) throw new Error("practice rooms can only invite the gnome trader");
  const s = load();
  const now = nowSec();
  const room: Room = {
    id: s.nextId++,
    status: "open",
    expired: false,
    version: 1,
    openSeat: cp === "",
    createdAt: now,
    expiresAt: now + ttl * 60,
    closedAt: 0,
    closedBy: "",
    maker: { address: who, locked: 0, assets: [] },
    taker: { address: cp, locked: 0, assets: [] },
    openMarket,
    want: [],
    feeBps: PRACTICE_FEE_BPS,
    now,
  };
  s.rooms.unshift(room);
  return room.id;
}

function join(who: string, id: number) {
  const room = find(id);
  assertLive(room);
  if (!room.openSeat) throw new Error("this room is invite only");
  if (room.taker.address !== "") throw new Error("the seat is already taken");
  if (who === room.maker.address) throw new Error("you opened this room");
  if (room.want.length > 0) throw new Error("this room is an offer: fill it instead");
  room.taker.address = who;
  bump(room);
}

function deposit(who: string, id: number, kind: AssetKind, denom: string, amount: bigint) {
  if (amount <= 0n) throw new Error("amount must be positive");
  if (kind === "nft" && amount !== 1n) throw new Error("an NFT moves whole: the amount must be 1");
  const room = find(id);
  assertLive(room);
  const [mine] = sideOf(room, who);
  assertAccepts(room, kind, denom);
  move(who, kind, denom, -amount);
  try {
    addAsset(mine, kind, denom, amount);
  } catch (e) {
    move(who, kind, denom, amount);
    throw e;
  }
  bump(room);
}

function withdraw(who: string, id: number, kind: AssetKind, denom: string, amount: bigint) {
  if (amount <= 0n) throw new Error("amount must be positive");
  if (kind === "nft" && amount !== 1n) throw new Error("an NFT moves whole: the amount must be 1");
  const room = find(id);
  assertOpen(room);
  const [mine] = sideOf(room, who);
  subAsset(mine, kind, denom, amount);
  bump(room);
  move(who, kind, denom, amount);
}

function lock(who: string, id: number, version: number): "locked" | "settled" {
  const room = find(id);
  assertLive(room);
  const [mine, theirs] = sideOf(room, who);
  if (room.taker.address === "") throw new Error("waiting for a counterparty to join");
  if (version !== room.version) throw new Error(`the room changed: review version ${room.version} and lock again`);
  if (room.maker.assets.length === 0 || room.taker.assets.length === 0) throw new Error("both sides need at least one asset");
  if (mine.locked === version) return "locked";
  mine.locked = version;
  if (theirs.locked === version) {
    settle(room, who);
    return "settled";
  }
  return "locked";
}

function unlock(who: string, id: number) {
  const room = find(id);
  assertOpen(room);
  const [mine] = sideOf(room, who);
  if (mine.locked !== room.version) throw new Error("you have not locked this version");
  mine.locked = 0;
  if (mine === room.maker) room.want = [];
}

function offer(who: string, id: number, version: number, want: Offer[]): number {
  const room = find(id);
  assertLive(room);
  if (who !== room.maker.address) throw new Error("only the maker can make an offer");
  if (version !== room.version) throw new Error(`the room changed: review version ${room.version} and offer again`);
  if (room.maker.assets.length === 0) throw new Error("put something in before you make an offer");
  if (room.taker.assets.length > 0) throw new Error("they have already put something in: agree in the room instead");
  if (want.length === 0) throw new Error("say what you want in return");
  if (want.length > MAX_ASSETS) throw new Error("an offer can want at most 8 different assets");
  const items: Asset[] = [];
  for (const w of want) {
    if (w.amount <= 0n) throw new Error("want amounts must be positive whole numbers of base units");
    if (w.kind === "nft" && w.amount !== 1n) throw new Error("an NFT is wanted whole: amount 1");
    if (items.some((a) => a.kind === w.kind && a.denom === w.denom)) throw new Error(`the want list names ${w.denom} twice`);
    assertAccepts(room, w.kind, w.denom);
    items.push({ kind: w.kind, denom: w.denom, amount: String(w.amount) });
  }
  bump(room);
  room.want = items;
  room.maker.locked = room.version;
  return room.version;
}

function fill(who: string, id: number, version: number) {
  const room = find(id);
  assertLive(room);
  if (room.want.length === 0) throw new Error("this room has no standing offer");
  if (version !== room.version) throw new Error(`the offer changed: review version ${room.version} and fill again`);
  if (room.maker.locked !== room.version) throw new Error("the offer is withdrawn");
  if (who === room.maker.address) throw new Error("you made this offer");
  if (room.taker.address !== "" && room.taker.address !== who) throw new Error("this offer is for another account");
  if (room.taker.address === "" && !room.openSeat) throw new Error("this offer is for another account");
  if (room.taker.assets.length > 0) throw new Error("this room is not an offer any more");
  for (const a of room.want) {
    if (balanceOf(who, a.kind, a.denom) < BigInt(a.amount)) {
      throw new Error(a.kind === "nft" ? `you do not own ${a.denom}` : a.kind === "coin" ? `you do not have ${a.amount}${a.denom}` : "you do not have enough of a wanted token");
    }
  }
  for (const a of room.want) move(who, a.kind, a.denom, -BigInt(a.amount));
  room.taker.address = who;
  room.taker.assets = room.want;
  room.taker.locked = room.version;
  room.want = [];
  settle(room, who);
}

function cancel(who: string, id: number) {
  const room = find(id);
  assertOpen(room);
  const party = who === room.maker.address || (room.taker.address !== "" && who === room.taker.address);
  if (!party && nowSec() < room.expiresAt) throw new Error("only the two parties can cancel a room before it expires");
  room.status = "cancelled";
  room.closedAt = nowSec();
  room.closedBy = who;
  payout(room.maker.address, room.maker.assets);
  if (room.taker.address) payout(room.taker.address, room.taker.assets);
}

// The scripted counterparty.

const timers = new Set<ReturnType<typeof setTimeout>>();

function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    try {
      fn();
      save();
    } catch {
      // the partner skips a move that the rules no longer allow
    }
  }, ms);
  timers.add(t);
}

function partnerMoves(id: number) {
  const s = load();
  const room = s.rooms.find((r) => r.id === id);
  if (!room || room.status !== "open" || nowSec() >= room.expiresAt) return;
  const script = (s.script[id] ??= {});
  const partnerSeat = room.maker.address === PRACTICE_PARTNER ? room.maker : room.taker.address === PRACTICE_PARTNER ? room.taker : null;

  if (!partnerSeat && room.openSeat && room.taker.address === "" && room.maker.address === PRACTICE_ME) {
    later(700, () => {
      join(PRACTICE_PARTNER, id);
      partnerMoves(id);
    });
    return;
  }
  if (!partnerSeat) return;

  // Your offer stands: the partner pays for it if it can, in one step.
  if (partnerSeat === room.taker && room.want.length > 0 && lockedNow(room.maker, room)) {
    if (script.filling) return;
    script.filling = true;
    const v = room.version;
    later(1400, () => {
      script.filling = false;
      fill(PRACTICE_PARTNER, id, v);
      gnomeSays(id, "Your price is fair. I paid it, and the trade is done.");
    });
    return;
  }
  // In a room opened for an offer, the partner waits for your price.
  if (script.waitForOffer && partnerSeat === room.taker) return;

  if (!script.deposited) {
    script.deposited = true;
    later(900, () => {
      deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, 25n * GNOT);
      deposit(PRACTICE_PARTNER, id, "nft", `${LANTERNS}#7`, 1n);
      gnomeSays(id, "A lantern and 25 wGNOT from me. What do you put in?");
      partnerMoves(id);
    });
    return;
  }

  const you = partnerSeat === room.maker ? room.taker : room.maker;
  if (you.locked === room.version && partnerSeat.locked !== room.version) {
    if (!script.nudged) {
      // Once per room, the partner changes the offer after you lock, so
      // you see a lock stop applying to a room that changed.
      script.nudged = true;
      later(1100, () => {
        deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, 5n * GNOT);
        gnomeSays(id, "I put in 5 more wGNOT, so your ready mark was cleared. Look again.", 200);
        const r = find(id);
        later(900, () => {
          lock(PRACTICE_PARTNER, id, r.version);
        });
      });
      return;
    }
    const v = room.version;
    later(900, () => {
      lock(PRACTICE_PARTNER, id, v);
    });
  }
}

function act<T>(fn: () => T, id?: number): Promise<T> {
  try {
    const result = fn();
    save();
    if (id !== undefined) partnerMoves(id);
    return Promise.resolve(result);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

const PRACTICE_TOKENS: TokenInfo[] = [
  { key: WUGNOT_KEY, name: "wrapped GNOT", symbol: "wugnot", decimals: 0, verified: true },
  { key: MOSS_KEY, name: "Moss", symbol: "MOSS", decimals: 6, verified: true },
  { key: PEBBLES_KEY, name: "Pebbles", symbol: "PEBBLE", decimals: 6, verified: false },
  { key: HATS, name: "Gnome hats", symbol: "HAT", decimals: 0, nft: true, verified: true },
  { key: LANTERNS, name: "Lanterns", symbol: "LANTERN", decimals: 0, nft: true, verified: true },
];

const KIND_ORDER: Record<AssetKind, number> = { coin: 0, token: 1, nft: 2 };

export const practiceVenue: Venue = {
  kind: "practice",
  base: "/practice",

  room: async (id) => {
    const room = load().rooms.find((r) => r.id === id);
    return room ? snapshot(room) : null;
  },
  roomsOf: async (address) => ({
    rooms: load()
      .rooms.filter((r) => r.maker.address === address || r.taker.address === address)
      .map(snapshot),
    more: false,
    now: nowSec(),
  }),
  tokens: async () => PRACTICE_TOKENS,
  verified: async () => ({ entries: PRACTICE_VERIFIED, now: nowSec() }),
  feeBps: async () => PRACTICE_FEE_BPS,
  inventory: async (address) =>
    Object.entries(load().balances[address] ?? {})
      .map(([key, amount]) => {
        const [kind, ...rest] = key.split(":");
        return { kind: kind as AssetKind, denom: rest.join(":"), balance: BigInt(amount) };
      })
      .filter((i) => i.balance > 0n)
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.kind === "nft" ? (a.denom < b.denom ? -1 : 1) : b.balance > a.balance ? 1 : -1)),
  balance: async (address, kind, denom) => ({
    balance: balanceOf(address, kind, denom),
    allowance: kind === "token" ? MAX_INT64 : undefined,
  }),

  open: (counterparty, ttl, openMarket) =>
    act(() => {
      const id = open(PRACTICE_ME, counterparty, ttl, openMarket);
      setTimeout(() => partnerMoves(id), 0);
      return id;
    }),
  offer: (id, version, want) => act(() => void offer(PRACTICE_ME, id, version, want), id),
  fill: (id, version) => act(() => fill(PRACTICE_ME, id, version), id),
  join: (id) => act(() => join(PRACTICE_ME, id), id),
  depositMany: (id, items) =>
    act(() => {
      // All or nothing, like one transaction.
      const backup = structuredClone(load());
      try {
        for (const i of items) deposit(PRACTICE_ME, id, i.kind, i.denom, i.amount);
      } catch (e) {
        state = backup;
        throw e;
      }
    }, id),
  depositCoins: (id, ugnot) => act(() => deposit(PRACTICE_ME, id, "coin", "ugnot", ugnot), id),
  depositToken: (id, key, amount) => act(() => deposit(PRACTICE_ME, id, "token", key, amount), id),
  withdraw: (id, asset, amount) => act(() => withdraw(PRACTICE_ME, id, asset.kind, asset.denom, amount), id),
  lock: (id, version) => act(() => lock(PRACTICE_ME, id, version), id),
  unlock: (id) => act(() => unlock(PRACTICE_ME, id), id),
  cancel: (id) => act(() => cancel(PRACTICE_ME, id), id),
};

/**
 * A practice room for an offer, opened from the practice rooms page. "make":
 * you name your price and the gnome trader, who waits for it, pays. "fill":
 * the trader puts a lantern in and names a price, and you fill it.
 */
export function openPracticeOffer(mode: "make" | "fill"): Promise<number> {
  return act(() => {
    const s = load();
    if (mode === "make") {
      const id = open(PRACTICE_ME, PRACTICE_PARTNER, 0);
      s.script[id] = { waitForOffer: true };
      gnomeSays(id, "Put something in and name your price. I pay it if I can.");
      return id;
    }
    const id = open(PRACTICE_PARTNER, PRACTICE_ME, 0);
    s.script[id] = { deposited: true };
    // The trader may have traded its lantern away in an earlier practice room.
    const room = find(id);
    const lantern = balanceOf(PRACTICE_PARTNER, "nft", `${LANTERNS}#7`) > 0n;
    if (lantern) deposit(PRACTICE_PARTNER, id, "nft", `${LANTERNS}#7`, 1n);
    else deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, 50n * GNOT);
    offer(PRACTICE_PARTNER, id, room.version, [{ kind: "coin", denom: "ugnot", amount: 40n * GNOT }]);
    gnomeSays(id, `${lantern ? "My lantern" : "50 wGNOT"} for 40 GNOT. Accept it if that suits you.`);
    return id;
  });
}

/** Test hook: the engine's rules without the scripted partner or storage. */
export const practiceRules = { open, join, deposit, withdraw, lock, unlock, cancel, offer, fill, fresh, load: () => load(), set: (s: PracticeState) => (state = s) };
