import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REALM_DIRS, REALM_FILES, type RealmName } from "@/lib/chain/realm-source";

// The launch page deploys these files: they must be exactly what is in the repository.
describe("embedded realm source", () => {
  for (const name of Object.keys(REALM_DIRS) as RealmName[]) {
    it(`matches ${REALM_DIRS[name]}`, () => {
      const dir = resolve(__dirname, "../../../../..", REALM_DIRS[name]);
      const expected = readdirSync(dir)
        .filter((f) => (f.endsWith(".gno") && !f.endsWith("_test.gno") && !f.endsWith("_filetest.gno")) || f === "gnomod.toml")
        .sort()
        .map((f) => ({ name: f, body: readFileSync(join(dir, f), "utf8") }));
      expect(REALM_FILES[name]).toEqual(expected);
      expect(REALM_FILES[name].some((f) => f.name.endsWith("_test.gno"))).toBe(false);
    });
  }
});
