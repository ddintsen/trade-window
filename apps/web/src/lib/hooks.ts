"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChainError } from "@/lib/chain/rpc";
import type { Asset, Room } from "@/lib/chain/types";
import { verifiedList, type VerifiedList } from "@/lib/chain/verified";
import { subscribePractice } from "@/lib/venue/practice";
import type { Venue } from "@/lib/venue/types";

interface PollState<T> {
  key: string | null;
  data: T | null;
  error: Error | null;
  loading: boolean;
  updatedAt: number | null;
}

export interface Loaded<T> {
  data: T | null;
  error: ChainError | Error | null;
  loading: boolean;
  /** Block time (or local time in practice) of the last successful read. */
  updatedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Polls a read while the tab is visible. A response is committed only if
 * it answers the latest request, so a slow old answer never replaces a
 * newer one.
 */
export function usePolled<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  practice = false,
): Loaded<T> {
  const blank = (k: string | null): PollState<T> => ({ key: k, data: null, error: null, loading: k !== null, updatedAt: null });
  const [state, setState] = useState<PollState<T>>(() => blank(key));
  // A new key starts from nothing: never show one key's answer under another.
  if (state.key !== key) setState(blank(key));

  const seq = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  const run = useCallback(async () => {
    if (key === null) return;
    const mine = ++seq.current;
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    try {
      const value = await loader.current(ctl.signal);
      if (mine !== seq.current) return;
      setState((s) => (s.key === key ? { key, data: value, error: null, loading: false, updatedAt: Date.now() } : s));
    } catch (e) {
      if (mine !== seq.current || (e instanceof DOMException && e.name === "AbortError")) return;
      const error = e instanceof Error ? e : new Error(String(e));
      setState((s) => (s.key === key ? { ...s, error, loading: false } : s));
    }
  }, [key]);

  useEffect(() => {
    if (key === null) return;
    const generation = seq;
    const pending = inflight;
    void run();
    let timer: ReturnType<typeof setInterval> | null = null;
    const startTimer = () => {
      if (timer === null && intervalMs > 0) timer = setInterval(() => void run(), intervalMs);
    };
    const stopTimer = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stopTimer();
      else {
        void run();
        startTimer();
      }
    };
    if (!document.hidden) startTimer();
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = practice ? subscribePractice(() => void run()) : () => {};
    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      generation.current++;
      pending.current?.abort();
    };
  }, [key, intervalMs, practice, run]);

  const current = state.key === key ? state : blank(key);
  return { data: current.data, error: current.error, loading: current.loading, updatedAt: current.updatedAt, refresh: run };
}

export function useRoom(venue: Venue, id: number | null) {
  return usePolled<Room | null>(
    id === null ? null : `${venue.kind}:room:${id}`,
    (signal) => venue.room(id as number, signal),
    venue.kind === "practice" ? 0 : 3000,
    venue.kind === "practice",
  );
}

/** The verified list, read once a minute: it changes only by the admin's hand, and slowly. */
export function useVerified(venue: Venue): VerifiedList | null {
  const res = usePolled(
    `${venue.kind}:verified`,
    async (signal) => {
      const { entries, now } = await venue.verified(signal);
      return verifiedList(entries, now);
    },
    venue.kind === "practice" ? 0 : 60_000,
  );
  return res.data;
}

/** What changed on one side between two readings of a room. */
export type RoomChange =
  | { side: "maker" | "taker"; type: "asset"; asset: Pick<Asset, "kind" | "denom">; before: bigint; after: bigint }
  | { side: "maker" | "taker"; type: "joined"; address: string };

function assetKey(a: Pick<Asset, "kind" | "denom">) {
  return `${a.kind}:${a.denom}`;
}

export function diffRooms(before: Room, after: Room): RoomChange[] {
  const changes: RoomChange[] = [];
  for (const side of ["maker", "taker"] as const) {
    const was = new Map(before[side].assets.map((a) => [assetKey(a), a]));
    const now = new Map(after[side].assets.map((a) => [assetKey(a), a]));
    if (before[side].address !== after[side].address && after[side].address) {
      changes.push({ side, type: "joined", address: after[side].address });
    }
    for (const [k, a] of now) {
      const prev = BigInt(was.get(k)?.amount ?? "0");
      const next = BigInt(a.amount);
      if (prev !== next) changes.push({ side, type: "asset", asset: a, before: prev, after: next });
    }
    for (const [k, a] of was) {
      if (!now.has(k)) changes.push({ side, type: "asset", asset: a, before: BigInt(a.amount), after: 0n });
    }
  }
  return changes;
}

/** Ticks once a second so countdowns stay current. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
