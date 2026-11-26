import { describe, expect, it } from "vitest";
import type { Room } from "@/lib/chain/types";
import { roomState, sortRooms } from "@/lib/room-state";

const ME = "g1me";
const THEM = "g1them";
const now = 1_000_000;

function room(over: Partial<Room> & { mine?: string[]; theirs?: string[]; meLocked?: number; theyLocked?: number } = {}): Room {
  const { mine = ["1"], theirs = ["1"], meLocked = 0, theyLocked = 0, ...rest } = over;
  return {
    id: 1,
    status: "open",
    expired: false,
    version: 5,
    openSeat: false,
    createdAt: now - 100,
    expiresAt: now + 3600,
    closedAt: 0,
    closedBy: "",
    maker: { address: ME, locked: meLocked, assets: mine.map((a) => ({ kind: "coin", denom: "ugnot", amount: a })) },
    taker: { address: THEM, locked: theyLocked, assets: theirs.map((a) => ({ kind: "coin", denom: "ugnot", amount: a })) },
    openMarket: false,
    want: [],
    feeBps: 50,
    now,
    ...rest,
  };
}

describe("roomState", () => {
  it("asks for action only when the room waits on the viewer", () => {
    expect(roomState(room({ mine: [] }), ME, now)).toMatchObject({ text: "Add what you give", attention: true });
    expect(roomState(room({ theirs: [] }), ME, now)).toMatchObject({ text: "Waiting for their offer", attention: false });
    expect(roomState(room({ theyLocked: 5 }), ME, now)).toMatchObject({ text: "They are ready: your turn", attention: true });
    expect(roomState(room({ meLocked: 5 }), ME, now)).toMatchObject({ attention: false });
    expect(roomState(room(), ME, now)).toMatchObject({ text: "Your turn to get ready", attention: true });
  });

  it("treats a lock on an older version as no lock", () => {
    expect(roomState(room({ theyLocked: 4 }), ME, now)).toMatchObject({ text: "Your turn to get ready" });
  });

  it("flags an expired room only while the viewer's deposit is inside", () => {
    expect(roomState(room({ expiresAt: now - 1 }), ME, now)).toMatchObject({ attention: true, closed: false });
    expect(roomState(room({ expiresAt: now - 1, mine: [] }), ME, now)).toMatchObject({ text: "Expired", attention: false });
  });

  it("orders waiting rooms first, closed rooms last", () => {
    const waiting = room({ id: 2, theyLocked: 5, expiresAt: now + 9000 });
    const calm = room({ id: 3, meLocked: 5, expiresAt: now + 60 });
    const done = room({ id: 4, status: "settled", closedAt: now - 5 });
    expect(sortRooms([done, calm, waiting], ME, now).map((r) => r.id)).toEqual([2, 3, 4]);
  });
});
