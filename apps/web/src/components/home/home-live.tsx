"use client";

import Link from "next/link";
import { assetsSummary } from "@/lib/chain/assets";
import { boardApi } from "@/lib/chain/board";
import { boardDeployed, network, roomsDeployed } from "@/lib/chain/config";
import { roomsApi } from "@/lib/chain/rooms";
import type { ListingSide } from "@/lib/chain/types";
import { ago } from "@/lib/format";
import { useNow, usePolled } from "@/lib/hooks";
import { PaneDiagram } from "@/components/brand/pane-diagram";
import { Address } from "@/components/ui/address";
import { LinkButton } from "@/components/ui/button";

const SIDE: Record<ListingSide, string> = { buy: "Buying", sell: "Selling", swap: "Swapping" };

/** Numbers and listings read from the chain; nothing here is made up. */
export function HomeLive() {
  if (!roomsDeployed && !boardDeployed) return <PracticeInvite />;
  return (
    <div className="flex flex-col gap-14">
      {roomsDeployed && <Stats />}
      {boardDeployed ? <Listings /> : <PracticeInvite />}
    </div>
  );
}

function Stats() {
  const stats = usePolled("home:stats", (signal) => roomsApi.stats(signal), 60_000);
  const tokens = usePolled("home:tokens", async (signal) => new Map((await roomsApi.tokens(signal)).map((t) => [t.key, t])), 0);
  if (!stats.data) return null;
  const s = stats.data;
  const volume = assetsSummary(s.volume, tokens.data ?? undefined, "");
  return (
    <p className="max-w-3xl text-[clamp(1.25rem,1.1rem+0.6vw,1.6rem)] leading-snug">
      On {network.name}, {s.rooms === 1 ? "1 room has" : `${s.rooms.toLocaleString("en")} rooms have`} been opened so far,{" "}
      {s.settled.toLocaleString("en")} settled and {s.cancelled.toLocaleString("en")} cancelled.
      {volume && <span className="text-muted"> Settled so far: {volume}.</span>}
    </p>
  );
}

function Listings() {
  const now = useNow();
  const list = usePolled("home:board", (signal) => boardApi.open("", 0, 4, signal), 60_000);
  const items = list.data?.listings ?? [];
  return (
    <section aria-labelledby="board-now" className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
      <div className="flex flex-col items-start gap-4">
        <h2 id="board-now" className="font-pixel text-[2.5rem]">
          On the board now
        </h2>
        <p className="text-[17px] text-muted">People post what they give and what they want. Open a room with any of them.</p>
        <LinkButton href="/board" variant="secondary">
          See the board
        </LinkButton>
      </div>
      {list.data && items.length === 0 ? (
        <p className="self-center text-[17px] text-muted">Nobody has posted yet.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {items.map((l) => (
            <li key={l.id}>
              <Link
                href={`/trade?with=${encodeURIComponent(l.owner)}`}
                className="grid gap-x-6 gap-y-1 bg-surface px-5 py-4 transition-colors hover:bg-control sm:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <span className="font-medium">{SIDE[l.side]}</span>
                <span className="min-w-0 break-words text-[15px]">
                  <span className="text-muted">Gives </span>
                  {l.give}
                </span>
                <span className="min-w-0 break-words text-[15px]">
                  <span className="text-muted">Wants </span>
                  {l.want}
                </span>
                <span className="text-sm text-muted sm:col-start-2 sm:col-end-4">
                  <Address value={l.owner} />, {ago(l.createdAt, now)}
                </span>
              </Link>
            </li>
          ))}
          {!list.data && <li className="bg-surface px-5 py-4 text-[15px] text-muted">Reading the board…</li>}
        </ul>
      )}
    </section>
  );
}

function PracticeInvite() {
  return (
    <section aria-labelledby="practice-now" className="grid items-center gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
      <div className="flex flex-col items-start gap-4">
        <h2 id="practice-now" className="font-pixel text-[2.5rem]">
          Try the whole trade without a wallet
        </h2>
        <p className="text-[17px] text-muted">The realm&apos;s rules in your browser, with play balances and a partner who trades back.</p>
        <LinkButton href="/practice" variant="primary">
          Open a practice room
        </LinkButton>
      </div>
      <PaneDiagram
        className="w-full max-w-[34rem] justify-self-center"
        state={{ maker: ["taker", "taker"], taker: ["maker", "maker", "maker"], version: 6, makerLit: true, takerLit: true, label: "A settled room: both lamps lit on version 6, the cubes crossed" }}
      />
    </section>
  );
}
