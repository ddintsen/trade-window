import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chain/config", async (orig) => ({
  ...(await orig<typeof import("@/lib/chain/config")>()),
  realms: { rooms: "gno.land/r/test/rooms", board: "gno.land/r/test/board" },
}));

describe("depositMany", () => {
  it("sends every coin on one DepositCoins call and pairs each token with its approval", async () => {
    const { roomsTx } = await import("@/lib/chain/rooms");
    const msgs = roomsTx.depositMany(
      "g1me",
      7,
      [
        { kind: "token", denom: "gno.land/r/gnoland/wugnot.wugnot", amount: 25n },
        { kind: "coin", denom: "ugnot", amount: 10n },
        { kind: "coin", denom: "uatom", amount: 3n },
      ],
      "g1realm",
    );
    expect(msgs.map((m) => [m.value.pkg_path, m.value.func, m.value.args, m.value.send])).toEqual([
      ["gno.land/r/test/rooms", "DepositCoins", ["7"], "3uatom,10ugnot"],
      ["gno.land/r/gnoland/wugnot", "Approve", ["g1realm", "25"], ""],
      ["gno.land/r/test/rooms", "DepositToken", ["7", "gno.land/r/gnoland/wugnot.wugnot", "25"], ""],
    ]);
  });

  it("approves an NFT in its collection's realm unless the realm may already move it", async () => {
    const { roomsTx } = await import("@/lib/chain/rooms");
    const msgs = roomsTx.depositMany(
      "g1me",
      7,
      [
        { kind: "nft", denom: "gno.land/r/art/lanterns.LAMP#7", amount: 1n, approved: false },
        { kind: "nft", denom: "gno.land/r/art/hats.HAT#a#b", amount: 1n, approved: true },
      ],
      "g1realm",
    );
    expect(msgs.map((m) => [m.value.pkg_path, m.value.func, m.value.args])).toEqual([
      ["gno.land/r/art/lanterns", "Approve", ["g1realm", "7"]],
      ["gno.land/r/test/rooms", "DepositNFT", ["7", "gno.land/r/art/lanterns.LAMP", "7"]],
      ["gno.land/r/test/rooms", "DepositNFT", ["7", "gno.land/r/art/hats.HAT", "a#b"]],
    ]);
    expect(roomsTx.withdrawNFT("g1me", 7, "gno.land/r/art/hats.HAT#a#b").map((m) => [m.value.func, m.value.args])).toEqual([
      ["WithdrawNFT", ["7", "gno.land/r/art/hats.HAT", "a#b"]],
    ]);
  });
});
