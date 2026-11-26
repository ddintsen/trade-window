import { PRACTICE_ME, PRACTICE_PARTNER } from "@/lib/venue/practice";

/** g1pa4zfnuxap6hqtyq6gn2h8ylld5skafcllqpxx -> g1pa4z…lqpxx */
export function shortAddress(address: string): string {
  if (address === PRACTICE_ME) return "You (practice)";
  if (address === PRACTICE_PARTNER) return "Gnome trader";
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-5)}`;
}

export function isPracticeAddress(address: string): boolean {
  return address.startsWith("practice:");
}

/** 83700 -> "23 h 15 min"; 540 -> "9 min"; 30 -> "less than a minute". */
export function duration(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

export function ago(seconds: number, now: number): string {
  const s = Math.max(0, now - seconds);
  if (s < 60) return "just now";
  return `${duration(s)} ago`;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function when(seconds: number): string {
  return dateTime.format(new Date(seconds * 1000));
}

export const LIFETIMES = [
  { minutes: 60, label: "1 hour" },
  { minutes: 6 * 60, label: "6 hours" },
  { minutes: 24 * 60, label: "24 hours" },
  { minutes: 3 * 24 * 60, label: "3 days" },
  { minutes: 7 * 24 * 60, label: "7 days" },
];
