// Shapes of the JSON documents the realms return. Amounts are base-unit
// strings; times are unix seconds of block time.

export type AssetKind = "coin" | "token" | "nft";

export interface Asset {
  kind: AssetKind;
  /**
   * Bank denom for coins, GRC20 registry key for tokens, and for an NFT its
   * collection key, "#" and the token id: one NFT is one asset.
   */
  denom: string;
  /** Base units; always "1" for an NFT. */
  amount: string;
}

export interface Side {
  address: string; // "" while an open seat is empty
  locked: number; // version this side locked, 0 when not locked
  assets: Asset[];
}

export type RoomStatus = "open" | "settled" | "cancelled";

export interface Room {
  id: number;
  status: RoomStatus;
  expired: boolean;
  version: number;
  openSeat: boolean;
  createdAt: number;
  expiresAt: number;
  closedAt: number;
  closedBy: string;
  maker: Side;
  taker: Side;
  /**
   * An open-market room takes any registered asset; an ordinary one only
   * verified assets.
   */
  openMarket: boolean;
  /** A standing offer: exactly what the maker wants for their side. Empty when there is none. */
  want: Asset[];
  /** The service fee this room settles with, in basis points, fixed when it opened. */
  feeBps: number;
  now: number;
}

export interface RoomList {
  rooms: Room[];
  more?: boolean;
  total?: number;
  now: number;
}

export interface Stats {
  rooms: number;
  settled: number;
  cancelled: number;
  volume: Asset[];
  /** Fees collected so far, per asset. */
  fees: Asset[];
  /** The rate new rooms open with, in basis points. */
  feeBps: number;
  treasury: string;
  paused: boolean;
  address: string;
  now: number;
}

export interface TokenInfo {
  key: string;
  name: string;
  symbol: string;
  decimals: number;
  balance?: string;
  allowance?: string;
  /** A GRC721 collection rather than a GRC20 token. */
  nft?: boolean;
  /** Ordinary rooms take it. */
  verified?: boolean;
}

/** One entry of the realm's verified list: counting already, or waiting out its delay. */
export interface Verification {
  kind: AssetKind;
  /** Coin denom, GRC20 registry key or NFT collection key. */
  key: string;
  reason: string;
  /** Unix seconds from which it counts. */
  since: number;
  active: boolean;
}

export type ListingSide = "buy" | "sell" | "swap";

export interface Listing {
  id: number;
  owner: string;
  side: ListingSide;
  give: string;
  want: string;
  note: string;
  open: boolean;
  createdAt: number;
  expiresAt: number;
  closedAt: number;
}

export interface ListingList {
  listings: Listing[];
  more: boolean;
  total?: number;
  now: number;
}

/** Which seat an address holds in a room, if any. */
export type Role = "maker" | "taker";

export function roleOf(room: Room, address: string | null | undefined): Role | null {
  if (!address) return null;
  if (room.maker.address === address) return "maker";
  if (room.taker.address !== "" && room.taker.address === address) return "taker";
  return null;
}

export function lockedNow(side: Side, room: Room): boolean {
  return side.locked !== 0 && side.locked === room.version;
}

/** The maker's standing offer, if one is open to fill. */
export function standingOffer(room: Room): boolean {
  return room.status === "open" && room.want.length > 0 && lockedNow(room.maker, room) && room.taker.assets.length === 0;
}
