import { describe, expect, it } from "vitest";
import { amountTier, assetLabel, assetMeta, assetsSummary, compactUnits, formatUnits, parseUnits } from "@/lib/chain/assets";
import { boardTextProblem, textLength } from "@/lib/chain/board";
import { WUGNOT_KEY } from "@/lib/chain/config";

describe("amounts", () => {
  it("formats base units", () => {
    expect(formatUnits("2500000", 6)).toBe("2.5");
    expect(formatUnits("1000000000", 6)).toBe("1,000");
    expect(formatUnits("1", 6)).toBe("0.000001");
    expect(formatUnits("0", 6)).toBe("0");
    expect(formatUnits(12345678901234567890n, 0)).toBe("12,345,678,901,234,567,890");
  });

  it("parses typed amounts and refuses extra precision", () => {
    expect(parseUnits("2.5", 6)).toBe(2500000n);
    expect(parseUnits("1,000", 6)).toBe(1000000000n);
    expect(parseUnits(".5", 6)).toBe(500000n);
    expect(parseUnits("0.0000001", 6)).toBeNull();
    expect(parseUnits("abc", 6)).toBeNull();
    expect(parseUnits("", 6)).toBeNull();
  });

  it("shows wrapped GNOT in GNOT units", () => {
    const meta = assetMeta("token", WUGNOT_KEY);
    expect(meta.decimals).toBe(6);
    expect(meta.name).toBe("Wrapped GNOT");
    expect(assetMeta("coin", "ugnot").symbol).toBe("GNOT");
  });
});

describe("board text mirrors the realm", () => {
  it("counts code points like utf8.RuneCountInString", () => {
    expect(textLength("  50 000 GNOT ")).toBe(11);
    expect(textLength("Привет")).toBe(6);
    expect(textLength("🙂")).toBe(1);
  });

  it("refuses what cleanText refuses", () => {
    expect(boardTextProblem("", 80, true)).toBe("Required");
    expect(boardTextProblem("", 280, false)).toBeNull();
    expect(boardTextProblem("a".repeat(81), 80, true)).toBe("At most 80 characters");
    expect(boardTextProblem("line\nbreak", 80, true)).toMatch(/line breaks/);
    expect(boardTextProblem("rtl\u202etrick", 80, true)).toMatch(/invisible/);
    expect(boardTextProblem("zero\u200bwidth", 80, true)).toMatch(/invisible/);
    expect(boardTextProblem("500 GNOT за ATONE", 80, true)).toBeNull();
  });
});

describe("assetsSummary", () => {
  it("joins assets in plain words", () => {
    expect(assetsSummary([])).toBe("nothing");
    expect(assetsSummary([], undefined, "Nothing yet")).toBe("Nothing yet");
    expect(assetsSummary([{ kind: "coin", denom: "ugnot", amount: "10000000" }])).toBe("10 GNOT");
    expect(
      assetsSummary([
        { kind: "coin", denom: "ugnot", amount: "10000000" },
        { kind: "token", denom: WUGNOT_KEY, amount: "2500000" },
        { kind: "token", denom: "gno.land/r/demo/foo.foo", amount: "7" },
      ]),
    ).toBe("10 GNOT, 2.5 wrapped GNOT and 7 foo");
  });
});

describe("stack counts", () => {
  const G = 1_000_000n;
  it("shortens large amounts and never rounds up", () => {
    expect(compactUnits(500_000n * G, 6)).toBe("500K");
    expect(compactUnits(12_500n * G, 6)).toBe("12.5K");
    expect(compactUnits(1_299_999n * G, 6)).toBe("1.2M");
    expect(compactUnits(999_999n * G, 6)).toBe("999K");
    expect(compactUnits(1_000_000n * G, 6)).toBe("1M");
    expect(compactUnits(3_000_000_000n, 0)).toBe("3B");
    expect(compactUnits(9223372036854775807n, 0)).toBe("9,223,372T");
  });

  it("keeps small amounts readable", () => {
    expect(compactUnits(9_999n * G + 999_999n, 6)).toBe("9,999");
    expect(compactUnits(123_456_789n, 6)).toBe("123.4");
    expect(compactUnits(12_345_678n, 6)).toBe("12.34");
    expect(compactUnits(10n * G, 6)).toBe("10");
    expect(compactUnits(123_456n, 6)).toBe("0.12");
    expect(compactUnits(1n, 6)).toBe("0.000001");
    expect(compactUnits(25n, 0)).toBe("25");
  });

  it("grows a pile with the amount", () => {
    expect(amountTier(1n * G, 6)).toBe(0);
    expect(amountTier(25n * G, 6)).toBe(1);
    expect(amountTier(5_000n * G, 6)).toBe(2);
    expect(amountTier(500_000n * G, 6)).toBe(3);
  });
});

describe("NFTs", () => {
  const tokens = new Map([["practice/hats", { key: "practice/hats", name: "Gnome hats", symbol: "HAT", decimals: 0, nft: true }]]);
  it("names an NFT by its collection and number", () => {
    const meta = assetMeta("nft", "practice/hats#12", tokens);
    expect(meta).toMatchObject({ collection: "practice/hats", tokenId: "12", decimals: 0, symbol: "HAT" });
    expect(assetLabel(meta)).toBe("Gnome hats #12");
    expect(assetsSummary([{ kind: "nft", denom: "practice/hats#12", amount: "1" }], tokens)).toBe("Gnome hats #12");
  });

  it("keeps everything after the first # as the token id", () => {
    expect(assetMeta("nft", "gno.land/r/x/col.ART#a#b").tokenId).toBe("a#b");
  });
});
