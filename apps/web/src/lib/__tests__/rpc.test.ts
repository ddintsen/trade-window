import { describe, expect, it } from "vitest";
import { errorSummary, parseTypedValue, unquoteGo } from "@/lib/chain/rpc";

describe("qeval output", () => {
  it("parses a string result the way the VM prints it", () => {
    const out = '("{\\"id\\":1,\\"note\\":\\"\\\\u041f\\"}" string)';
    const { literal, type } = parseTypedValue(out);
    expect(type).toBe("string");
    const json = JSON.parse(unquoteGo(literal));
    expect(json).toEqual({ id: 1, note: "П" });
  });

  it("parses numbers and booleans", () => {
    expect(parseTypedValue("(42 uint64)")).toEqual({ literal: "42", type: "uint64" });
    expect(parseTypedValue("(true bool)")).toEqual({ literal: "true", type: "bool" });
  });

  it("decodes every Go escape", () => {
    expect(unquoteGo('"a\\tb\\nc\\\\d\\"e\\x41\\u00e9\\U0001F600"')).toBe('a\tb\nc\\d"eAé😀');
  });

  it("rejects text that is not a typed value", () => {
    expect(() => parseTypedValue("nope")).toThrow();
  });

  it("finds the realm's panic message in a chain log", () => {
    const log = "--= Error =--\nData: ...\nVM panic: the room changed: review version 4 and lock again\nstack...";
    expect(errorSummary(log)).toBe("the room changed: review version 4 and lock again");
    const notFound = "--= Error =--\nMsg Traces:\n    0  gno/gno.land/pkg/sdk/vm/errors.go:88 - package not found: gno.land/r/x\n";
    expect(errorSummary(notFound)).toBe("package not found: gno.land/r/x");
  });

  it("reads the log gnokey and the node print for a refused call", () => {
    // Recorded from a local chain: Lock with a stale version.
    const log = [
      "--= Error =--",
      "Data: the room changed: review version 1 and lock again",
      "Msg Traces:",
      "    0  github.com/gnolang/gno/tm2/pkg/errors/errors.go:103 - deliver transaction failed: log:msg:0,success:false,log:--= Error =--",
      'Data: errors.FmtError{format:"the room changed: review version 1 and lock again", args:[]interface {}(nil)}',
      "Msg Traces:",
      "    0  gno/tm2/pkg/errors/errors.go:103 - VM panic: the room changed: review version 1 and lock again",
      "Stacktrace:",
      "panic: the room changed: review version 1 and lock again",
    ].join("\n");
    expect(errorSummary(log)).toBe("the room changed: review version 1 and lock again");
    expect(errorSummary("--= Error =--\nData: insufficient funds\n--= /Error =--")).toBe("insufficient funds");
  });
});
