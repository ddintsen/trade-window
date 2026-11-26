import { describe, expect, it } from "vitest";
import { MAX_INT64 } from "@/lib/chain/assets";
import { feeOf, feePercent, feeSplit } from "@/lib/chain/fee";
import { classOf, verifiedList, wantText } from "@/lib/chain/verified";

describe("the fee, as the realm computes it", () => {
  it("matches TestFeeOf in fee_test.gno", () => {
    expect(feeOf(0n, 50)).toBe(0n);
    expect(feeOf(199n, 50)).toBe(0n);
    expect(feeOf(200n, 50)).toBe(1n);
    expect(feeOf(1_000_000n, 50)).toBe(5_000n);
    expect(feeOf(1_000_000n, 0)).toBe(0n);
    expect(feeOf(MAX_INT64, 100)).toBe((MAX_INT64 / 10000n) * 100n + ((MAX_INT64 % 10000n) * 100n) / 10000n);
  });

  it("never charges more than the 1% cap, and lets NFTs cross free", () => {
    expect(feeOf(1_000_000n, 500)).toBe(10_000n);
    expect(feeSplit({ kind: "nft", amount: "1" }, 50)).toEqual({ fee: 0n, net: 1n });
    expect(feeSplit({ kind: "coin", amount: "10000000" }, 50)).toEqual({ fee: 50_000n, net: 9_950_000n });
  });

  it("says the rate in percent", () => {
    expect(feePercent(50)).toBe("0.5%");
    expect(feePercent(100)).toBe("1%");
    expect(feePercent(25)).toBe("0.25%");
    expect(feePercent(0)).toBe("0%");
  });
});

describe("the verified list", () => {
  it("counts an NFT by its collection, and waits out a pending verification", () => {
    const list = verifiedList(
      [
        { kind: "coin", key: "ugnot", reason: "", since: 0, active: true },
        { kind: "nft", key: "gno.land/r/a/art.ART", reason: "", since: 100, active: false },
      ],
      50,
    );
    expect(list.active.has(classOf("coin", "ugnot"))).toBe(true);
    expect(classOf("nft", "gno.land/r/a/art.ART#7")).toBe("nft:gno.land/r/a/art.ART");
    expect(list.active.has(classOf("nft", "gno.land/r/a/art.ART#7"))).toBe(false);
    expect(list.pending.get("nft:gno.land/r/a/art.ART")?.since).toBe(100);
  });

  it("writes the want list the way the realm reads it", () => {
    expect(
      wantText([
        { kind: "coin", denom: "ugnot", amount: 40_000_000n },
        { kind: "nft", denom: "gno.land/r/a/art.ART#7", amount: "1" },
      ]),
    ).toBe("coin 40000000 ugnot\nnft 1 gno.land/r/a/art.ART#7");
  });
});
