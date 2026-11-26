import { describe, expect, it } from "vitest";
import { checkAddress } from "@/lib/chain/address";

describe("checkAddress", () => {
  it("accepts real gno.land addresses", () => {
    for (const a of [
      "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
      "g1pa4zfnuxap6hqtyq6gn2h8ylld5skafcllqpxx",
      "g1pare7m4rnhqjp8tjrljncjry0gycvfd8lw3zh8",
    ]) {
      expect(checkAddress(a)).toEqual({ ok: true, address: a });
    }
  });

  it("trims spaces and accepts all-uppercase input", () => {
    expect(checkAddress("  G1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5 ")).toEqual({
      ok: true,
      address: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
    });
  });

  it("catches a one-character typo", () => {
    const r = checkAddress("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf6");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/checksum/);
  });

  it("explains the common mistakes", () => {
    const reason = (s: string) => {
      const r = checkAddress(s);
      return r.ok ? "" : r.reason;
    };
    expect(reason("")).toBe("Enter an address");
    expect(reason("@alice")).toMatch(/username/);
    expect(reason("cosmos1abc")).toMatch(/starts with g1/);
    expect(reason("g1abc")).toMatch(/40 characters/);
    expect(reason("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqfb")).toMatch(/cannot appear/);
    expect(reason("g1Jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5")).toMatch(/lowercase or all uppercase/);
  });
});
