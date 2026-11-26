"use client";

// Chat in practice rooms: kept in this browser, and the gnome trader answers
// from a short script. It haggles a little and says when it changes its
// offer, so the chat can be tried without anyone on the other side.

import { PRACTICE_ME, PRACTICE_PARTNER } from "@/lib/venue/seats";
import { cleanText, KEEP, type ChatMessage } from "./types";

const KEY = "tw.practice.chat.v1";
const EMPTY: ChatMessage[] = [];

let rooms: Record<number, ChatMessage[]> | null = null;
const listeners = new Set<() => void>();
const pending = new Map<number, ReturnType<typeof setTimeout>>();

function load(): Record<number, ChatMessage[]> {
  if (rooms) return rooms;
  try {
    rooms = (JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<number, ChatMessage[]>) ?? {};
  } catch {
    rooms = {};
  }
  return rooms;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    // the chat still works for this visit
  }
  listeners.forEach((l) => l());
}

function append(room: number, from: string, text: string) {
  const all = load();
  const list = all[room] ?? [];
  const seq = (list.at(-1)?.seq ?? 0) + 1;
  // A new array each time: the page compares snapshots by reference.
  all[room] = [...list, { seq, from, text, at: Date.now() }].slice(-KEEP);
  save();
}

export function subscribePracticeChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function practiceMessages(room: number): ChatMessage[] {
  if (typeof window === "undefined") return EMPTY;
  return load()[room] ?? EMPTY;
}

export const practiceMessagesOnServer = (): ChatMessage[] => EMPTY;

export function clearPracticeChat() {
  pending.forEach((t) => clearTimeout(t));
  pending.clear();
  rooms = {};
  save();
}

/** The gnome trader says something in a room, after a short pause. */
export function gnomeSays(room: number, text: string, delay = 600) {
  setTimeout(() => append(room, PRACTICE_PARTNER, text), delay);
}

// Most specific first: a thank-you that says "ok" is still a thank-you.
const RULES: [RegExp, string][] = [
  [/\b(scam|safe|trust|cheat|honest)|обман|кинеш|честн|доверя/i, "Nothing said here counts. Only what is in the window moves, and only when we both mark ready."],
  [/\b(thanks?|thx|ty)\b|спасиб|благодар/i, "A fair trade. Come back to the bridge any time."],
  [/\b(cheaper|less|lower|discount|too much|expensive)\b|скидк|дешевл|меньше|дорого/i, "My lantern is worth what I ask. Add a little more and I will mark myself ready."],
  [/\b(more|add|extra)\b|больше|добав|ещ[её]/i, "That is all I mean to put in. If it is not enough, take your items back: nothing moves until we both mark ready."],
  [/\b(ready|deal|agree|ok|okay|done)\b|готов|договор|ладно|согла|(^|\s)ок($|[\s!.,])/i, "Then mark yourself ready. I mark mine once I see yours on the same version."],
  [/\b(hello|hi|hey|greetings)\b|привет|здравств|добр(ый|ое)/i, "Hello, traveller. Look at what I put on the bridge, then tell me what you want for yours."],
];
const IDLE = ["Hm. Talk is cheap on this bridge; the window is what counts.", "Put it in the window and I will look.", "I hear you. Show me in the window."];

/** The gnome's answer to a message. */
export function gnomeReply(text: string, turn: number): string {
  return RULES.find(([re]) => re.test(text))?.[1] ?? IDLE[turn % IDLE.length];
}

/** Your message in a practice room; the gnome answers once you pause. */
export function sayInPractice(room: number, text: string) {
  const clean = cleanText(text);
  if (!clean) return;
  append(room, PRACTICE_ME, clean);
  clearTimeout(pending.get(room));
  const turn = (load()[room] ?? []).filter((m) => m.from === PRACTICE_ME).length - 1;
  pending.set(
    room,
    setTimeout(() => {
      pending.delete(room);
      append(room, PRACTICE_PARTNER, gnomeReply(clean, turn));
    }, 1100),
  );
}
