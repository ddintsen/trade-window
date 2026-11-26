// Trade chat on the server. A room's chat is readable and writable only by
// its two parties, as the rooms realm names them; an account proves it is
// one of them by signing a one-time sign-in text with Adena. Nothing here
// can move an asset or change a room.

import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";
import type { Room } from "@/lib/chain/types";
import { roleOf } from "@/lib/chain/types";
import { ADDRESS, signInText } from "./sign-in";
import type { ChatStore } from "./store";
import { cleanText, KEEP, type ChatMessage } from "./types";
import { verifyArbitrary, type ArbitrarySignature } from "./verify";

export interface ChatContext {
  store: ChatStore;
  chainId: string;
  roomsPath: string;
  /** The room as the realm has it; `fresh` skips any cache. */
  readRoom(id: number, fresh?: boolean): Promise<Room | null>;
  now(): number;
}

export type FailCode = "bad-request" | "bad-signature" | "signed-out" | "forbidden" | "closed" | "rate" | "not-found";

const STATUS: Record<FailCode, number> = {
  "bad-request": 400,
  "signed-out": 401,
  "bad-signature": 403,
  forbidden: 403,
  "not-found": 404,
  closed: 409,
  rate: 429,
};

export class ChatFail extends Error {
  status: number;
  constructor(
    public code: FailCode,
    message: string,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

/** A sign-in text is good for five minutes, a session for a day, a room's chat for 30 days after its last message. */
export const NONCE_TTL = 5 * 60;
export const SESSION_TTL = 24 * 60 * 60;
export const ROOM_TTL = 30 * 24 * 60 * 60;
/** Per minute: sign-in texts per network address, messages per account. */
export const NONCES_PER_MINUTE = 20;
export const MESSAGES_PER_MINUTE = 20;

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hash = (s: string) => bytesToHex(sha256(new TextEncoder().encode(s)));
const minute = (ctx: ChatContext) => Math.floor(ctx.now() / 60_000);
const roomKey = (ctx: ChatContext, id: number) => `tw:chat:room:${ctx.chainId}:${ctx.roomsPath}:${id}`;

/** Writes a one-time sign-in text for an address. */
export async function issueNonce(ctx: ChatContext, address: string, domain: string, client: string): Promise<{ nonce: string; text: string }> {
  if (!ADDRESS.test(address)) throw new ChatFail("bad-request", "That is not a gno address.");
  if ((await ctx.store.count(`tw:chat:rate:nonce:${client}:${minute(ctx)}`, 60)) > NONCES_PER_MINUTE) {
    throw new ChatFail("rate", "Too many sign-ins from here. Wait a minute.");
  }
  const nonce = bytesToHex(random(16));
  const text = signInText({ domain, address, chainId: ctx.chainId, nonce, issuedAt: new Date(ctx.now()).toISOString() });
  await ctx.store.put(`tw:chat:nonce:${nonce}`, JSON.stringify({ address, text }), NONCE_TTL);
  return { nonce, text };
}

/** Spends a nonce: when the signature is the address's own over its text, opens a session for that address. */
export async function openSession(ctx: ChatContext, nonce: string, signature: ArbitrarySignature): Promise<{ token: string; address: string; expiresAt: number }> {
  if (typeof nonce !== "string" || !/^[0-9a-f]{32}$/.test(nonce)) throw new ChatFail("bad-request", "The sign-in is malformed.");
  const raw = await ctx.store.take(`tw:chat:nonce:${nonce}`);
  if (!raw) throw new ChatFail("signed-out", "The sign-in ran out or was used. Sign in again.");
  const { address, text } = JSON.parse(raw) as { address: string; text: string };
  // Adena signs for the network it is on: a signature made on another network fails here too.
  if (!verifyArbitrary(ctx.chainId, address, text, signature)) {
    throw new ChatFail("bad-signature", `The signature does not match this account on ${ctx.chainId}. Check that Adena is on that network and account, then sign in again.`);
  }
  const token = base64urlnopad.encode(random(32));
  await ctx.store.put(`tw:chat:session:${hash(token)}`, address, SESSION_TTL);
  return { token, address, expiresAt: ctx.now() + SESSION_TTL * 1000 };
}

/** The account a session token belongs to. */
export async function sessionAddress(ctx: ChatContext, token: string | null): Promise<string> {
  const address = token ? await ctx.store.get(`tw:chat:session:${hash(token)}`) : null;
  if (!address) throw new ChatFail("signed-out", "Sign in to chat.");
  return address;
}

/** The room, when the address is one of its two parties. */
async function partyRoom(ctx: ChatContext, address: string, id: number): Promise<Room> {
  if (!Number.isSafeInteger(id) || id < 1) throw new ChatFail("bad-request", "No such room.");
  let room = await ctx.readRoom(id);
  // The room may be new, or someone may have just taken its open seat: ask the chain again before refusing.
  if (!room || !roleOf(room, address)) room = await ctx.readRoom(id, true);
  if (!room) throw new ChatFail("not-found", "There is no trade with this number.");
  if (!roleOf(room, address)) throw new ChatFail("forbidden", "Only the two traders of this room can read its chat.");
  return room;
}

function parse(raw: string): ChatMessage | null {
  try {
    const m = JSON.parse(raw) as ChatMessage;
    return typeof m.seq === "number" && typeof m.text === "string" && typeof m.from === "string" ? m : null;
  } catch {
    return null;
  }
}

/** Messages after seq `after`, oldest first, and whether the room still takes new ones. */
export async function readMessages(ctx: ChatContext, address: string, id: number, after: number): Promise<{ messages: ChatMessage[]; open: boolean }> {
  const room = await partyRoom(ctx, address, id);
  const messages = (await ctx.store.list(roomKey(ctx, id)))
    .map(parse)
    .filter((m): m is ChatMessage => !!m && m.seq > after)
    .sort((a, b) => a.seq - b.seq);
  return { messages, open: room.status === "open" };
}

/** Adds a message from a party of an open room. */
export async function postMessage(ctx: ChatContext, address: string, id: number, text: unknown): Promise<ChatMessage> {
  const clean = typeof text === "string" ? cleanText(text) : "";
  if (!clean) throw new ChatFail("bad-request", "Write something first.");
  const room = await partyRoom(ctx, address, id);
  if (room.status !== "open") throw new ChatFail("closed", "This trade is closed, so its chat is read-only.");
  if ((await ctx.store.count(`tw:chat:rate:send:${address}:${minute(ctx)}`, 60)) > MESSAGES_PER_MINUTE) {
    throw new ChatFail("rate", "That is a lot of messages. Wait a minute.");
  }
  const key = roomKey(ctx, id);
  const message: ChatMessage = { seq: await ctx.store.next(`${key}:seq`), from: address, text: clean, at: ctx.now() };
  await ctx.store.append(key, JSON.stringify(message), KEEP, ROOM_TTL);
  return message;
}
