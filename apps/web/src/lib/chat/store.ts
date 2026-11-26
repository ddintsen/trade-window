// Where trade chat keeps its state on the server: Upstash Redis over its REST
// API when the site has it (Vercel's Upstash integration sets KV_REST_API_URL
// and KV_REST_API_TOKEN), and process memory for local runs and tests. A
// production site without Redis has no chat rather than one that forgets.

export interface ChatStore {
  /** Sets a key that disappears after ttl seconds. */
  put(key: string, value: string, ttl: number): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Gets a key and deletes it in one step, so it can be used once. */
  take(key: string): Promise<string | null>;
  /** Adds one to a counter that starts its ttl on first use; returns the new count. */
  count(key: string, ttl: number): Promise<number>;
  /** Adds one to a counter that never expires on its own. */
  next(key: string): Promise<number>;
  /** Appends to a list, keeps its last `keep` entries and refreshes its ttl. */
  append(key: string, value: string, keep: number, ttl: number): Promise<void>;
  list(key: string): Promise<string[]>;
}

type Command = (string | number)[];

/** Upstash Redis through its REST pipeline. */
export function upstashStore(url: string, token: string): ChatStore {
  const base = url.replace(/\/+$/, "");
  async function pipeline(commands: Command[]): Promise<unknown[]> {
    const res = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`chat store answered ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const failed = out.find((r) => r.error);
    if (failed) throw new Error(`chat store: ${failed.error}`);
    return out.map((r) => r.result);
  }
  const one = async (c: Command) => (await pipeline([c]))[0];
  return {
    put: async (key, value, ttl) => void (await one(["SET", key, value, "EX", ttl])),
    get: async (key) => ((await one(["GET", key])) as string | null) ?? null,
    take: async (key) => ((await one(["GETDEL", key])) as string | null) ?? null,
    count: async (key, ttl) => Number((await pipeline([["INCR", key], ["EXPIRE", key, ttl, "NX"]]))[0]),
    next: async (key) => Number(await one(["INCR", key])),
    append: async (key, value, keep, ttl) =>
      void (await pipeline([
        ["RPUSH", key, value],
        ["LTRIM", key, -keep, -1],
        ["EXPIRE", key, ttl],
      ])),
    list: async (key) => ((await one(["LRANGE", key, 0, -1])) as string[] | null) ?? [],
  };
}

/** Process memory, for `next dev`, `next start` and tests: one server process, gone on restart. */
export function memoryStore(): ChatStore {
  const values = new Map<string, { value: string; until: number }>();
  const lists = new Map<string, { items: string[]; until: number }>();
  const alive = <T extends { until: number }>(m: Map<string, T>, key: string) => {
    const e = m.get(key);
    if (e && e.until <= Date.now()) {
      m.delete(key);
      return undefined;
    }
    return e;
  };
  const later = (ttl: number) => (ttl > 0 ? Date.now() + ttl * 1000 : Infinity);
  return {
    put: async (key, value, ttl) => void values.set(key, { value, until: later(ttl) }),
    get: async (key) => alive(values, key)?.value ?? null,
    take: async (key) => {
      const v = alive(values, key)?.value ?? null;
      values.delete(key);
      return v;
    },
    count: async (key, ttl) => {
      const e = alive(values, key);
      const n = Number(e?.value ?? 0) + 1;
      values.set(key, { value: String(n), until: e?.until ?? later(ttl) });
      return n;
    },
    next: async (key) => {
      const n = Number(alive(values, key)?.value ?? 0) + 1;
      values.set(key, { value: String(n), until: Infinity });
      return n;
    },
    append: async (key, value, keep, ttl) => {
      const items = [...(alive(lists, key)?.items ?? []), value].slice(-keep);
      lists.set(key, { items, until: later(ttl) });
    },
    list: async (key) => [...(alive(lists, key)?.items ?? [])],
  };
}

const holder = globalThis as unknown as { __twChatStore?: ChatStore | null };

/** The store this server uses, or null when chat is not set up here. */
export function chatStore(): ChatStore | null {
  if (holder.__twChatStore !== undefined) return holder.__twChatStore;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) holder.__twChatStore = upstashStore(url, token);
  else if (process.env.CHAT_STORE === "memory" || process.env.NODE_ENV !== "production") holder.__twChatStore = memoryStore();
  else holder.__twChatStore = null;
  return holder.__twChatStore;
}
