import { describe, expect, it } from "vitest";
import { gnomeReply } from "@/lib/chat/practice";

describe("the gnome trader's replies", () => {
  it("haggles back, in English or Russian", () => {
    expect(gnomeReply("Could you give me a discount?", 0)).toMatch(/^My lantern is worth what I ask/);
    expect(gnomeReply("а можно дешевле?", 0)).toMatch(/^My lantern is worth what I ask/);
  });

  it("points to the window when asked whether to trust it", () => {
    expect(gnomeReply("is this safe? you will not scam me?", 0)).toMatch(/^Nothing said here counts/);
  });

  it("tells you to mark ready when you agree, and thanks you back", () => {
    expect(gnomeReply("ok, deal", 0)).toMatch(/^Then mark yourself ready/);
    expect(gnomeReply("ок", 0)).toMatch(/^Then mark yourself ready/);
    expect(gnomeReply("ok thanks!", 0)).toMatch(/^A fair trade/);
  });

  it("does not read words inside other words", () => {
    // "this" holds "hi", "address" holds "add"; neither is a greeting or a request for more.
    expect(gnomeReply("this", 0)).not.toMatch(/^Hello/);
    expect(gnomeReply("what address", 0)).not.toMatch(/^That is all I mean/);
  });

  it("falls back to a few lines in turn", () => {
    expect(gnomeReply("hm", 0)).not.toBe(gnomeReply("hm", 1));
  });
});
