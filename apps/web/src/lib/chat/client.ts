"use client";

// Trade chat for rooms on chain, from the page's side: sign in once with
// Adena (an off-chain signature, no transaction), then read and send through
// this site's chat routes with the session token.

import { network } from "@/lib/chain/config";
import { signText } from "@/lib/wallet/adena";
import type { ChatMessage } from "./types";

export type ChatErrorKind = "off" | "not-live" | "signed-out" | "bad-signature" | "forbidden" | "closed" | "rate" | "bad-request" | "not-found" | "unavailable";

export class ChatError extends Error {
  constructor(
    public kind: ChatErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

export interface ChatSession {
  address: string;
  token: string;
  expiresAt: number;
}

const storageKey = (address: string) => `tw.chat.session.${network.chainId}.${address}`;

/** A session saved in this browser for the account, if it has not run out. */
export function savedSession(address: string): ChatSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(address)) ?? "null") as ChatSession | null;
    return s && s.address === address && s.expiresAt > Date.now() + 60_000 ? s : null;
  } catch {
    return null;
  }
}

export function forgetSession(address: string) {
  try {
    localStorage.removeItem(storageKey(address));
  } catch {
    // nothing saved, nothing to forget
  }
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ChatError("unavailable", "Chat could not be reached. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: ChatErrorKind; message?: string };
  if (!res.ok) throw new ChatError(data.error ?? "unavailable", data.message ?? `Chat answered ${res.status}.`);
  return data;
}

/** Signs in: the server writes a one-time text, Adena signs it, the server checks it and returns a session. */
export async function signIn(address: string): Promise<ChatSession> {
  const { nonce, text } = await call<{ nonce: string; text: string }>("/api/chat/nonce", { method: "POST", body: JSON.stringify({ address }) });
  const signature = await signText(address, text);
  const session = await call<ChatSession>("/api/chat/session", { method: "POST", body: JSON.stringify({ nonce, signature }) });
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(session));
  } catch {
    // signing in again next visit is the cost
  }
  return session;
}

export function fetchMessages(session: ChatSession, room: number, after: number, signal?: AbortSignal) {
  return call<{ messages: ChatMessage[]; open: boolean }>(`/api/chat/rooms/${room}?after=${after}`, { token: session.token, signal });
}

export async function sendMessage(session: ChatSession, room: number, text: string): Promise<ChatMessage> {
  return (await call<{ message: ChatMessage }>(`/api/chat/rooms/${room}`, { method: "POST", token: session.token, body: JSON.stringify({ text }) })).message;
}
