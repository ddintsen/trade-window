"use client";

import { useState } from "react";
import { boardApi, boardTx } from "@/lib/chain/board";
import { boardDeployed, network } from "@/lib/chain/config";
import type { Listing, ListingSide } from "@/lib/chain/types";
import { cx } from "@/lib/cx";
import { ago, duration } from "@/lib/format";
import { useNow, usePolled } from "@/lib/hooks";
import { sendCalls, WalletError } from "@/lib/wallet/adena";
import { useWallet } from "@/lib/wallet/store";
import { Address } from "@/components/ui/address";
import { Button, LinkButton } from "@/components/ui/button";
import { Segmented } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

const SIDE_LABEL: Record<ListingSide, string> = { buy: "Buying", sell: "Selling", swap: "Swapping" };
const PAGE = 20;

export function BoardView() {
  if (!boardDeployed) return <BoardNotDeployed />;
  return <Board />;
}

function BoardNotDeployed() {
  return (
    <div className="shell py-10 lg:py-14">
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Board</h1>
        <p className="text-[17px] text-muted">
          The board is where people post what they give and what they want, so a counterparty can find them and open a room. It
          is not live on {network.name} yet: it goes live together with the rooms realm.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <LinkButton href="/practice" variant="primary">
            Try a practice room
          </LinkButton>
          <LinkButton href="/request" variant="secondary">
            Send a private request
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

function Board() {
  const w = useWallet();
  const me = w.status === "connected" && w.onAppNetwork ? (w.account?.address ?? null) : null;
  const [side, setSide] = useState<"" | ListingSide>("");
  const [limit, setLimit] = useState(PAGE);
  const now = useNow();
  const list = usePolled(`board:${side}:${limit}`, (signal) => boardApi.open(side, 0, limit, signal), 20_000);
  const mine = usePolled(me ? `board:of:${me}` : null, (signal) => boardApi.of(me as string, 0, 50, signal), 20_000);
  const myOpen = (mine.data?.listings ?? []).filter((l) => l.open && now < l.expiresAt);

  return (
    <div className="shell py-10 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <header className="flex max-w-2xl flex-col gap-3">
          <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Board</h1>
          <p className="text-[17px] text-muted">
            Public offers, stored in the board realm on {network.name}. A listing holds no assets; a deal happens when you open a
            room with its owner and you are both ready.
          </p>
        </header>
        <LinkButton href="/board/new" variant="primary">
          Post a listing
        </LinkButton>
      </div>

      {myOpen.length > 0 && (
        <section aria-labelledby="mine-title" className="mt-10 flex flex-col gap-4">
          <h2 id="mine-title" className="font-pixel text-[2.1rem]">
            Your open listings ({myOpen.length} of 10)
          </h2>
          <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
            {myOpen.map((l) => (
              <ListingRow key={l.id} listing={l} now={now} me={me} onClosed={() => void Promise.all([mine.refresh(), list.refresh()])} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="open-title" className="mt-10 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="open-title" className="font-pixel text-[2.1rem]">
            Open listings
          </h2>
          <Segmented
            label="Show listings"
            value={side}
            onChange={(v) => {
              setSide(v);
              setLimit(PAGE);
            }}
            options={[
              { value: "", label: "All" },
              { value: "buy", label: "Buying" },
              { value: "sell", label: "Selling" },
              { value: "swap", label: "Swapping" },
            ]}
          />
        </div>

        {list.error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 notch bg-alert-bg px-4 py-3 text-[15px] text-alert">
            <span>The board could not be read. {list.error.message}</span>
            <Button size="sm" variant="quiet" className="text-alert" onClick={() => void list.refresh()}>
              Try again
            </Button>
          </div>
        )}

        {list.loading && !list.data && <p className="text-[15px] text-muted">Reading the board…</p>}

        {list.data && list.data.listings.length === 0 && (
          <div className="notch notch-lg slab bg-surface p-6">
            <p className="text-[15px] text-muted">
              {side === "" ? "Nobody has posted yet. The first listing could be yours." : `No open ${SIDE_LABEL[side].toLowerCase()} listings right now.`}
            </p>
          </div>
        )}

        {list.data && list.data.listings.length > 0 && (
          <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
            {list.data.listings.map((l) => (
              <ListingRow key={l.id} listing={l} now={now} me={me} onClosed={() => void Promise.all([mine.refresh(), list.refresh()])} />
            ))}
          </ul>
        )}

        {list.data?.more && (
          <Button variant="secondary" className="w-fit" onClick={() => setLimit((n) => Math.min(n + PAGE, 50))} disabled={limit >= 50}>
            {limit >= 50 ? "Showing the newest 50" : "Show more"}
          </Button>
        )}
      </section>
    </div>
  );
}

function ListingRow({ listing, now, me, onClosed }: { listing: Listing; now: number; me: string | null; onClosed: () => void }) {
  const own = !!me && listing.owner === me;
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function close() {
    if (!me) return;
    setBusy(true);
    try {
      await sendCalls(boardTx.close(me, listing.id));
      toast("Listing closed", { tone: "done" });
      onClosed();
    } catch (e) {
      if (e instanceof WalletError && e.kind === "rejected") toast("Cancelled in Adena");
      else toast("The listing was not closed", { tone: "error", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <li className={cx("grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_minmax(12rem,0.9fr)_auto]", own ? "bg-raise" : "bg-surface")}>
      <div className="flex flex-col gap-0.5 sm:col-span-2 xl:col-span-1">
        <span className="font-medium">{SIDE_LABEL[listing.side]}</span>
        <span className="text-sm text-muted">Listing {listing.id}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-muted">Gives</span>
        <span className="break-words text-[15px]">{listing.give}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-muted">Wants</span>
        <span className="break-words text-[15px]">{listing.want}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2 xl:col-span-1">
        <span className="text-[15px]">{own ? "You" : <Address value={listing.owner} />}</span>
        <span className="text-sm text-muted">
          Posted {ago(listing.createdAt, now)}. Up for {duration(Math.max(0, listing.expiresAt - now))} more.
        </span>
      </div>
      <div className="flex items-start sm:col-span-2 xl:col-span-1 xl:justify-end">
        {own ? (
          confirm ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="danger" busy={busy} busyLabel="Confirm in Adena…" onClick={() => void close()}>
                Close it
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="quiet" onClick={() => setConfirm(true)}>
              Close listing
            </Button>
          )
        ) : (
          <LinkButton size="sm" variant="secondary" href={`/trade?with=${encodeURIComponent(listing.owner)}`}>
            Open a room with them
          </LinkButton>
        )}
      </div>
      {listing.note && <p className="break-words text-[15px] text-muted sm:col-span-2 xl:col-span-5 xl:pl-[8.5rem]">{listing.note}</p>}
    </li>
  );
}
