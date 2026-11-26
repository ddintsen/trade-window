// The chat routes' shared plumbing: which store and rooms realm they use,
// small JSON bodies, and one shape for every refusal.

import { network, realms } from "@/lib/chain/config";
import { roomsApi } from "@/lib/chain/rooms";
import type { Room } from "@/lib/chain/types";
import { ChatFail, type ChatContext } from "./server";
import { chatStore } from "./store";

/** Room reads are cached briefly: a poll every few seconds should not become a chain query each time. */
const ROOM_CACHE_MS = 10_000;
const rooms = new Map<number, { room: Room | null; until: number }>();

async function readRoom(id: number, fresh = false): Promise<Room | null> {
  const hit = rooms.get(id);
  if (!fresh && hit && hit.until > Date.now()) return hit.room;
  const room = await roomsApi.room(id);
  if (rooms.size > 500) rooms.clear();
  rooms.set(id, { room, until: Date.now() + ROOM_CACHE_MS });
  return room;
}

export function fail(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function ok(data: unknown): Response {
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

/** Runs a chat route: answers 503 when chat or the realm is not set up, and turns refusals into JSON. */
export async function route(fn: (ctx: ChatContext) => Promise<Response>): Promise<Response> {
  const store = chatStore();
  if (!store) return fail(503, "off", "Chat is not switched on for this site yet.");
  if (!realms.rooms) return fail(503, "not-live", "Trades are not live on this network yet.");
  const ctx: ChatContext = { store, chainId: network.chainId, roomsPath: realms.rooms, readRoom, now: () => Date.now() };
  try {
    return await fn(ctx);
  } catch (e) {
    if (e instanceof ChatFail) return fail(e.status, e.code, e.message);
    console.error("chat route failed", e);
    return fail(502, "unavailable", "Chat could not reach what it needs. Try again shortly.");
  }
}

/** A small JSON body, or a refusal for anything larger than a few kilobytes or not JSON. */
export async function body<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > 8192) throw new ChatFail("bad-request", "That is too long.");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ChatFail("bad-request", "The request is malformed.");
  }
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
}

/** Who is asking, for rate limits: the platform's forwarded address, or one shared bucket locally. */
export function clientOf(request: Request): string {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
