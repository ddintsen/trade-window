import type { Asset, AssetKind, Room, RoomList, TokenInfo, Verification } from "@/lib/chain/types";

/**
 * Where rooms live. "testnet" is the deployed realm on the configured
 * network, signed with Adena. "practice" runs the same rules in this
 * browser with play balances and a scripted counterparty.
 */
export type VenueKind = "testnet" | "practice";

/** Something in a wallet that can go into a trade window. */
export interface InventoryItem {
  kind: AssetKind;
  denom: string;
  balance: bigint;
}

/** An item and amount to put into a room. */
export interface Offer {
  kind: AssetKind;
  denom: string;
  amount: bigint;
}

export interface Venue {
  kind: VenueKind;
  /** Path prefix for room pages in this venue. */
  base: string;

  room(id: number, signal?: AbortSignal): Promise<Room | null>;
  roomsOf(address: string, signal?: AbortSignal): Promise<RoomList>;
  tokens(signal?: AbortSignal): Promise<TokenInfo[]>;
  /** Balance of one asset in base units, plus the allowance to the rooms realm for tokens. */
  balance(address: string, kind: Asset["kind"], denom: string, signal?: AbortSignal): Promise<{ balance: bigint; allowance?: bigint }>;

  /** Everything the address holds that a room accepts, largest first within each kind. */
  inventory(address: string, signal?: AbortSignal): Promise<InventoryItem[]>;
  /** The verified list, with the block time it was read at. */
  verified(signal?: AbortSignal): Promise<{ entries: Verification[]; now: number }>;
  /** The fee rate new rooms open with, in basis points. */
  feeBps(signal?: AbortSignal): Promise<number>;

  /** An open-market room takes unverified assets; it is a different call, so the wallet names it. */
  open(counterparty: string, ttlMinutes: number, openMarket?: boolean): Promise<number>;
  /** The maker's terms: their side at this version for exactly these items. Marks the maker ready. */
  offer(id: number, version: number, want: Offer[]): Promise<void>;
  /** Accepts the standing offer at this version: what it wants goes in and the room settles, in one signature. */
  fill(id: number, version: number): Promise<void>;
  /** Puts several items into the room at once: one signature on testnet. */
  depositMany(id: number, items: Offer[]): Promise<void>;
  join(id: number): Promise<void>;
  depositCoins(id: number, ugnot: bigint): Promise<void>;
  depositToken(id: number, key: string, amount: bigint): Promise<void>;
  withdraw(id: number, asset: Pick<Asset, "kind" | "denom">, amount: bigint): Promise<void>;
  lock(id: number, version: number): Promise<"locked" | "settled">;
  unlock(id: number): Promise<void>;
  cancel(id: number): Promise<void>;
}
