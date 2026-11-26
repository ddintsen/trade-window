import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore, upstashStore } from "@/lib/chat/store";

afterEach(() => vi.unstubAllGlobals());

describe("the Upstash store", () => {
  it("sends Redis commands to the REST pipeline with the token", async () => {
    const calls: { url: string; auth: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as string[][];
        calls.push({ url, auth: (init.headers as Record<string, string>).Authorization, body });
        return new Response(JSON.stringify(body.map((c) => ({ result: c[0] === "INCR" ? 3 : c[0] === "LRANGE" ? ["a", "b"] : "OK" }))));
      }),
    );
    const store = upstashStore("https://example.upstash.io/", "tok");
    await store.put("k", "v", 300);
    expect(await store.count("c", 60)).toBe(3);
    await store.append("l", "x", 200, 99);
    expect(await store.list("l")).toEqual(["a", "b"]);
    expect(calls[0]).toEqual({ url: "https://example.upstash.io/pipeline", auth: "Bearer tok", body: [["SET", "k", "v", "EX", "300"]] });
    expect(calls[1].body).toEqual([["INCR", "c"], ["EXPIRE", "c", "60", "NX"]]);
    expect(calls[2].body).toEqual([["RPUSH", "l", "x"], ["LTRIM", "l", "-200", "-1"], ["EXPIRE", "l", "99"]]);
  });

  it("fails loudly on an error from Redis or the network", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ error: "WRONGTYPE" }]))));
    await expect(upstashStore("https://x", "t").get("k")).rejects.toThrow(/WRONGTYPE/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await expect(upstashStore("https://x", "t").get("k")).rejects.toThrow(/401/);
  });
});

describe("the memory store", () => {
  it("uses a taken key once and forgets keys past their time", async () => {
    const store = memoryStore();
    await store.put("n", "1", 300);
    expect(await store.take("n")).toBe("1");
    expect(await store.take("n")).toBeNull();
    await store.put("gone", "1", 1);
    const real = Date.now;
    Date.now = () => real() + 1500;
    try {
      expect(await store.get("gone")).toBeNull();
    } finally {
      Date.now = real;
    }
  });

  it("keeps only the last entries of a list", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) await store.append("l", String(i), 3, 60);
    expect(await store.list("l")).toEqual(["2", "3", "4"]);
  });
});
