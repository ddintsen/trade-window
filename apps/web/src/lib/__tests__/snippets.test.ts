import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCK_SOURCE, LOCK_SOURCE_FILE } from "@/lib/snippets";

describe("source excerpts", () => {
  it("match the realm code", () => {
    const source = readFileSync(resolve(__dirname, "../../../../..", LOCK_SOURCE_FILE), "utf8");
    expect(source).toContain(LOCK_SOURCE);
  });
});
