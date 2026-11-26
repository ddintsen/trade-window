"use client";

import { useWallet } from "@/lib/wallet/store";
import { PRACTICE_ME, practiceVenue } from "./practice";
import { testnetVenue } from "./testnet";
import type { Venue, VenueKind } from "./types";

/** The venue for a kind, and the address that acts in it right now. */
export function useVenue(kind: VenueKind): { venue: Venue; me: string | null; ready: boolean } {
  const w = useWallet();
  if (kind === "practice") return { venue: practiceVenue, me: PRACTICE_ME, ready: true };
  const ready = w.status === "connected" && !!w.account && w.onAppNetwork;
  return { venue: testnetVenue, me: w.account?.address ?? null, ready };
}
