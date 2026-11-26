// Trade chat: what the two parties of a room say to each other while they
// agree on a deal. Messages live off chain and never change what the window
// holds; only the room's own state settles.

export interface ChatMessage {
  /** Order within the room, from 1. */
  seq: number;
  /** Account that wrote it: a g1 address, or a practice seat. */
  from: string;
  text: string;
  /** Unix milliseconds. */
  at: number;
}

/** Longest message, in characters. */
export const MAX_TEXT = 500;
/** Messages a room keeps; older ones drop off. */
export const KEEP = 200;

// Bidi overrides and isolates can make a message read differently from
// what it holds ("send 1" shown as "1 dnes"); zero-width marks hide text.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** A message as it is stored and shown: one line, no hidden characters, at most MAX_TEXT characters. */
export function cleanText(text: string): string {
  const flat = text.normalize("NFC").replace(INVISIBLE, "").replace(CONTROL, " ").replace(/ {2,}/g, " ").trim();
  return [...flat].slice(0, MAX_TEXT).join("");
}

/** Merges new messages into a list in order, once each. */
export function mergeMessages(list: ChatMessage[], more: ChatMessage[]): ChatMessage[] {
  if (more.length === 0) return list;
  const seen = new Set(list.map((m) => m.seq));
  const fresh = more.filter((m) => !seen.has(m.seq));
  if (fresh.length === 0) return list;
  return [...list, ...fresh].sort((a, b) => a.seq - b.seq).slice(-KEEP);
}
