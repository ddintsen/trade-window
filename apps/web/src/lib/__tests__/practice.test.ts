import { beforeEach, describe, expect, it } from "vitest";
import { WUGNOT_KEY } from "@/lib/chain/config";
import { PRACTICE_ME, PRACTICE_PARTNER, PRACTICE_TREASURY, practiceRules as rules } from "@/lib/venue/practice";
import { diffRooms } from "@/lib/hooks";

const G = 1_000_000n;

describe("practice rules mirror the realm", () => {
  beforeEach(() => {
    rules.set(rules.fresh());
  });

  it("swaps on the second lock of the same version", () => {
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    rules.deposit(PRACTICE_ME, id, "coin", "ugnot", 10n * G);
    rules.deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, 25n * G);
    const room = rules.load().rooms[0];
    expect(room.version).toBe(3);
    expect(rules.lock(PRACTICE_ME, id, 3)).toBe("locked");
    expect(rules.lock(PRACTICE_PARTNER, id, 3)).toBe("settled");
    const bal = rules.load().balances;
    // Each side receives the other's assets less the 0.5% fee; the fee goes to the treasury.
    expect(bal[PRACTICE_ME][`token:${WUGNOT_KEY}`]).toBe(String(200n * G + 25n * G - 125_000n));
    expect(bal[PRACTICE_PARTNER]["coin:ugnot"]).toBe(String(1000n * G + 10n * G - 50_000n));
    expect(bal[PRACTICE_TREASURY][`token:${WUGNOT_KEY}`]).toBe("125000");
    expect(bal[PRACTICE_TREASURY]["coin:ugnot"]).toBe("50000");
  });

  it("refuses a lock on a version that changed", () => {
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    rules.deposit(PRACTICE_ME, id, "coin", "ugnot", G);
    rules.deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, G);
    rules.lock(PRACTICE_ME, id, 3);
    rules.deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, G);
    expect(() => rules.lock(PRACTICE_ME, id, 3)).toThrow("the room changed: review version 4 and lock again");
    expect(rules.lock(PRACTICE_PARTNER, id, 4)).toBe("locked");
    expect(rules.lock(PRACTICE_ME, id, 4)).toBe("settled");
  });

  it("returns deposits on cancel and keeps balances whole", () => {
    const id = rules.open(PRACTICE_ME, "", 60);
    rules.join(PRACTICE_PARTNER, id);
    rules.deposit(PRACTICE_ME, id, "coin", "ugnot", 7n * G);
    rules.cancel(PRACTICE_ME, id);
    expect(rules.load().balances[PRACTICE_ME]["coin:ugnot"]).toBe(String(1000n * G));
    expect(() => rules.lock(PRACTICE_ME, id, 3)).toThrow("this room is cancelled");
  });

  it("enforces the same limits", () => {
    expect(() => rules.open(PRACTICE_ME, "", 5)).toThrow("room lifetime must be between 10 minutes and 7 days");
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    expect(() => rules.deposit(PRACTICE_ME, id, "coin", "ugnot", 0n)).toThrow("amount must be positive");
    expect(() => rules.deposit(PRACTICE_ME, id, "coin", "ugnot", 5000n * G)).toThrow("insufficient coins");
    expect(() => rules.lock(PRACTICE_ME, id, 1)).toThrow("both sides need at least one asset");
  });

  it("describes what changed between readings", () => {
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    const before = structuredClone(rules.load().rooms[0]);
    rules.deposit(PRACTICE_PARTNER, id, "token", WUGNOT_KEY, 5n * G);
    const after = rules.load().rooms[0];
    const changes = diffRooms(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ side: "taker", type: "asset", before: 0n, after: 5n * G });
  });
});

describe("practice batches", () => {
  beforeEach(() => {
    rules.set(rules.fresh());
  });

  it("puts several items in at once, or none of them", async () => {
    const { practiceVenue } = await import("@/lib/venue/practice");
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    await practiceVenue.depositMany(id, [
      { kind: "coin", denom: "ugnot", amount: 5n * G },
      { kind: "token", denom: WUGNOT_KEY, amount: 7n * G },
    ]);
    const room = rules.load().rooms[0];
    expect(room.maker.assets.map((a) => a.amount)).toEqual([String(5n * G), String(7n * G)]);
    expect(room.version).toBe(3);

    await expect(
      practiceVenue.depositMany(id, [
        { kind: "coin", denom: "ugnot", amount: G },
        { kind: "token", denom: WUGNOT_KEY, amount: 10_000n * G },
      ]),
    ).rejects.toThrow("insufficient token balance");
    const after = rules.load();
    expect(after.rooms[0].version).toBe(3);
    expect(after.balances[PRACTICE_ME]["coin:ugnot"]).toBe(String(995n * G));
  });

  it("lists the inventory: coins, then tokens by size, then NFTs", async () => {
    const { practiceVenue, PRACTICE_ME: me, MOSS_KEY, PEBBLES_KEY, HATS, LANTERNS } = await import("@/lib/venue/practice");
    const items = await practiceVenue.inventory(me);
    expect(items.map((i) => [i.kind, i.denom, i.balance])).toEqual([
      ["coin", "ugnot", 1000n * G],
      ["token", MOSS_KEY, 500_000n * G],
      ["token", PEBBLES_KEY, 2_000n * G],
      ["token", WUGNOT_KEY, 200n * G],
      ["nft", `${HATS}#12`, 1n],
      ["nft", `${LANTERNS}#3`, 1n],
    ]);
  });
});

describe("practice NFTs", () => {
  beforeEach(() => {
    rules.set(rules.fresh());
  });

  it("moves an NFT whole and swaps it on settlement", async () => {
    const { HATS, LANTERNS } = await import("@/lib/venue/practice");
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    expect(() => rules.deposit(PRACTICE_ME, id, "nft", `${HATS}#12`, 2n)).toThrow("an NFT moves whole: the amount must be 1");
    expect(() => rules.deposit(PRACTICE_ME, id, "nft", `${HATS}#5`, 1n)).toThrow("you do not own that NFT");
    rules.deposit(PRACTICE_ME, id, "nft", `${HATS}#12`, 1n);
    rules.deposit(PRACTICE_PARTNER, id, "nft", `${LANTERNS}#7`, 1n);
    expect(rules.lock(PRACTICE_ME, id, 3)).toBe("locked");
    expect(rules.lock(PRACTICE_PARTNER, id, 3)).toBe("settled");
    const bal = rules.load().balances;
    expect(bal[PRACTICE_ME][`nft:${LANTERNS}#7`]).toBe("1");
    expect(bal[PRACTICE_ME][`nft:${HATS}#12`]).toBe("0");
    expect(bal[PRACTICE_PARTNER][`nft:${HATS}#12`]).toBe("1");
  });
});

describe("practice offers, verified assets and the fee", () => {
  beforeEach(() => {
    rules.set(rules.fresh());
  });

  it("keeps unverified assets out of ordinary rooms, and takes them in open-market rooms", async () => {
    const { PEBBLES_KEY } = await import("@/lib/venue/practice");
    const plain = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    expect(() => rules.deposit(PRACTICE_ME, plain, "token", PEBBLES_KEY, G)).toThrow(
      `this room takes only verified assets, and ${PEBBLES_KEY} is not verified: trade it in an open-market room`,
    );
    const market = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0, true);
    rules.deposit(PRACTICE_ME, market, "token", PEBBLES_KEY, G);
    expect(rules.load().rooms[0].maker.assets).toHaveLength(1);
  });

  it("fills a named price in one step, and settles with the fee", async () => {
    const { LANTERNS } = await import("@/lib/venue/practice");
    const id = rules.open(PRACTICE_PARTNER, PRACTICE_ME, 0);
    rules.deposit(PRACTICE_PARTNER, id, "nft", `${LANTERNS}#7`, 1n);
    const v = rules.offer(PRACTICE_PARTNER, id, 2, [{ kind: "coin", denom: "ugnot", amount: 40n * G }]);
    expect(v).toBe(3);
    expect(() => rules.join(PRACTICE_ME, id)).toThrow("this room is invite only");
    expect(() => rules.fill(PRACTICE_ME, id, 2)).toThrow("the offer changed: review version 3 and fill again");
    rules.fill(PRACTICE_ME, id, 3);
    const room = rules.load().rooms[0];
    expect(room.status).toBe("settled");
    const bal = rules.load().balances;
    expect(bal[PRACTICE_ME][`nft:${LANTERNS}#7`]).toBe("1");
    expect(bal[PRACTICE_ME]["coin:ugnot"]).toBe(String(960n * G));
    expect(bal[PRACTICE_PARTNER]["coin:ugnot"]).toBe(String(1000n * G + 40n * G - 200_000n));
  });

  it("withdraws a price when anything changes, and refuses a fill of an old version", () => {
    const id = rules.open(PRACTICE_ME, PRACTICE_PARTNER, 0);
    rules.deposit(PRACTICE_ME, id, "coin", "ugnot", 5n * G);
    const v = rules.offer(PRACTICE_ME, id, 2, [{ kind: "token", denom: WUGNOT_KEY, amount: 6n * G }]);
    rules.deposit(PRACTICE_ME, id, "coin", "ugnot", G);
    const room = rules.load().rooms[0];
    expect(room.want).toEqual([]);
    expect(() => rules.fill(PRACTICE_PARTNER, id, v)).toThrow("this room has no standing offer");
    expect(() => rules.offer(PRACTICE_PARTNER, id, room.version, [{ kind: "coin", denom: "ugnot", amount: G }])).toThrow("only the maker can make an offer");
  });
});
