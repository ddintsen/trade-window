// One line that says where a room stands for the person looking at it, and
// whether it is waiting on them. The words are the trade window's: ready,
// not lock.

import type { Room } from "@/lib/chain/types";
import { lockedNow, roleOf, standingOffer } from "@/lib/chain/types";
import { duration, when } from "@/lib/format";

export interface RoomState {
  text: string;
  /** The room is waiting for something only this viewer can do. */
  attention: boolean;
  closed: boolean;
}

export function roomState(room: Room, me: string | null, now: number): RoomState {
  if (room.status === "settled") return { text: `Traded ${when(room.closedAt)}`, attention: false, closed: true };
  if (room.status === "cancelled") return { text: `Cancelled ${when(room.closedAt)}`, attention: false, closed: true };

  const role = roleOf(room, me);
  const mine = role ? room[role] : null;
  const theirs = role ? room[role === "maker" ? "taker" : "maker"] : null;

  if (now >= room.expiresAt) {
    const stuck = !!mine && mine.assets.length > 0;
    return {
      text: stuck ? "Expired: take your items back" : "Expired",
      attention: stuck,
      closed: false,
    };
  }
  // A named price: the maker waits, the other side accepts it in one step.
  if (standingOffer(room)) {
    if (role === "maker") {
      return { text: room.taker.address ? "Your price is up: waiting for them" : "Your price is up for anyone with the link", attention: false, closed: false };
    }
    if (role === "taker") return { text: "They named a price: your turn", attention: true, closed: false };
  }
  if (!room.taker.address) return { text: "Waiting for someone to join", attention: false, closed: false };
  if (!mine || !theirs) return { text: "Open", attention: false, closed: false };

  const meLocked = lockedNow(mine, room);
  const theyLocked = lockedNow(theirs, room);
  if (mine.assets.length === 0) return { text: "Add what you give", attention: true, closed: false };
  if (theirs.assets.length === 0) return { text: "Waiting for their offer", attention: false, closed: false };
  if (theyLocked && !meLocked) return { text: "They are ready: your turn", attention: true, closed: false };
  if (meLocked) return { text: "Ready, waiting for them", attention: false, closed: false };
  return { text: "Your turn to get ready", attention: true, closed: false };
}

/** Rooms waiting on the viewer first, then open rooms by what expires soonest, then closed rooms, newest first. */
export function sortRooms(rooms: Room[], me: string | null, now: number): Room[] {
  const rank = (r: Room) => {
    const s = roomState(r, me, now);
    return s.closed ? 2 : s.attention ? 0 : 1;
  };
  return [...rooms].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    if (rank(a) === 2) return b.closedAt - a.closedAt;
    return a.expiresAt - b.expiresAt;
  });
}

export function expiresText(room: Room, now: number): string {
  if (room.status !== "open") return "";
  if (now >= room.expiresAt) return "";
  return `${duration(room.expiresAt - now)} left`;
}
