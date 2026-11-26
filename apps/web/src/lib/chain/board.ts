// Reads from and messages for the board realm.

import { realms } from "./config";
import { call } from "./messages";
import { goString, qevalJSON } from "./rpc";
import type { Listing, ListingList, ListingSide } from "./types";

const B = () => realms.board;

export const boardApi = {
  open: (side: ListingSide | "" = "", offset = 0, limit = 50, signal?: AbortSignal) =>
    qevalJSON<ListingList>(B(), `OpenJSON(${goString(side)}, ${offset}, ${limit})`, signal),
  of: (owner: string, offset = 0, limit = 50, signal?: AbortSignal) =>
    qevalJSON<ListingList>(B(), `ListingsOfJSON(${goString(owner)}, ${offset}, ${limit})`, signal),
  listing: (id: number, signal?: AbortSignal) => qevalJSON<Listing | null>(B(), `ListingJSON(${id})`, signal),
};

export const boardTx = {
  post: (caller: string, side: ListingSide, give: string, want: string, note: string, days: number) =>
    [call(caller, B(), "Post", [side, give, want, note, days])],
  close: (caller: string, id: number) => [call(caller, B(), "Close", [id])],
};

/** Limits enforced by the realm, mirrored so the form can say them up front. */
export const BOARD_LIMITS = { give: 80, want: 80, note: 280, days: 30, active: 10 };

// Control, bidi and zero-width characters, refused by the realm's cleanText.
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u;

/** Characters as the realm counts them (code points). */
export function textLength(s: string): number {
  return [...s.trim()].length;
}

/** The realm's checks for one listing field, in words for the form. */
export function boardTextProblem(s: string, max: number, required: boolean): string | null {
  const t = s.trim();
  if (required && t === "") return "Required";
  if (textLength(t) > max) return `At most ${max} characters`;
  if (FORBIDDEN.test(t)) return "Remove line breaks and invisible formatting characters";
  return null;
}
