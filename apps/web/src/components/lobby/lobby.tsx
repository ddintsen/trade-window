"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { checkAddress } from "@/lib/chain/address";
import { assetLabel, assetMeta, assetsSummary, formatUnits } from "@/lib/chain/assets";
import { isMainnet, network, roomsDeployed, WUGNOT_KEY } from "@/lib/chain/config";
import { roomsApi } from "@/lib/chain/rooms";
import type { Room, TokenInfo } from "@/lib/chain/types";
import { lockedNow, roleOf, standingOffer } from "@/lib/chain/types";
import { cx } from "@/lib/cx";
import { LIFETIMES } from "@/lib/format";
import { useNow, usePolled } from "@/lib/hooks";
import { expiresText, roomState, sortRooms } from "@/lib/room-state";
import { feePercent } from "@/lib/chain/fee";
import { MOSS_KEY, openPracticeOffer, PEBBLES_KEY, PRACTICE_ME, PRACTICE_PARTNER, resetPractice } from "@/lib/venue/practice";
import type { Venue, VenueKind } from "@/lib/venue/types";
import { useVenue } from "@/lib/venue/use-venue";
import { WalletError } from "@/lib/wallet/adena";
import { useWallet } from "@/lib/wallet/store";
import { Address } from "@/components/ui/address";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Segmented, Select } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { WalletButton } from "@/components/wallet/wallet-button";
import { Lamp } from "@/components/room/lamp";

const CLOSED_SHOWN = 6;

export function Lobby({ kind, invite = "" }: { kind: VenueKind; invite?: string }) {
  const { venue, me, ready } = useVenue(kind);
  const practice = kind === "practice";

  if (!practice && !roomsDeployed) return <NotDeployed />;

  return (
    <div className="shell py-10 lg:py-14">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">
          {practice ? "Practice rooms" : "Rooms"}
        </h1>
        {practice && <p className="text-[17px] text-muted">Play balances, kept in this browser. Nothing touches a chain.</p>}
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="order-2 lg:order-1">
          <YourRooms kind={kind} venue={venue} me={me} ready={ready} />
        </div>
        <aside className="order-1 flex flex-col gap-4 lg:sticky lg:top-24 lg:order-2">
          <OpenRoomForm kind={kind} venue={venue} me={me} ready={ready} invite={practice ? "" : invite} />
          {practice && <PracticePrice />}
          {practice ? <PracticeBalances venue={venue} /> : ready && me ? <TestnetBalance venue={venue} me={me} /> : null}
          {!practice && <GoToRoom venue={venue} />}
        </aside>
      </div>
    </div>
  );
}

function NotDeployed() {
  return (
    <div className="shell py-10 lg:py-14">
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Rooms</h1>
        <p className="text-[17px] text-muted">
          Rooms are not live on {network.name} yet. Practice rooms run the same rules in your browser.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <LinkButton href="/practice" variant="primary">
            Open a practice room
          </LinkButton>
          <LinkButton href="/contract" variant="secondary">
            Read the contract
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

/* Your rooms */

function YourRooms({ kind, venue, me, ready }: { kind: VenueKind; venue: Venue; me: string | null; ready: boolean }) {
  const practice = kind === "practice";
  const now = useNow();
  const [tokens, setTokens] = useState<Map<string, TokenInfo>>(new Map());
  const [showAll, setShowAll] = useState(false);
  const list = usePolled(
    ready && me ? `${kind}:rooms:${me}` : null,
    (signal) => venue.roomsOf(me as string, signal),
    practice ? 0 : 8000,
    practice,
  );

  useEffect(() => {
    let alive = true;
    venue
      .tokens()
      .then((t) => alive && setTokens(new Map(t.map((x) => [x.key, x]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [venue]);

  const sorted = useMemo(() => (list.data ? sortRooms(list.data.rooms, me, now) : []), [list.data, me, now]);
  // Accounts this one has completed a trade with. A room someone else opened
  // for you, from an account you never traded with, and that you have not
  // put anything into, is an invitation: listed apart, so a stranger's room
  // never reads like a trade under way.
  const known = useMemo(() => {
    const k = new Set<string>();
    for (const r of list.data?.rooms ?? []) {
      if (r.status !== "settled") continue;
      k.add(r.maker.address);
      k.add(r.taker.address);
    }
    return k;
  }, [list.data]);
  const isInvitation = (r: Room) =>
    !practice && r.status === "open" && r.maker.address !== me && r.taker.address === me && r.taker.assets.length === 0 && !known.has(r.maker.address);
  const live = sorted.filter((r) => !roomState(r, me, now).closed);
  const invitations = live.filter(isInvitation);
  const open = live.filter((r) => !isInvitation(r));
  const closed = sorted.filter((r) => roomState(r, me, now).closed);
  const waiting = open.filter((r) => roomState(r, me, now).attention).length;

  if (!ready) {
    return (
      <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
        <h2 id="rooms-title" className="font-pixel text-[2.1rem]">
          Your rooms
        </h2>
        <div className="flex flex-col items-start gap-4 notch notch-lg slab bg-surface p-6">
          <p className="max-w-md text-[15px] text-muted">Connect Adena to see your rooms.</p>
          <WalletButton />
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="rooms-title" className="font-pixel text-[2.1rem]">
          {open.length > 0 ? `Open rooms (${open.length})` : closed.length > 0 ? "Open rooms" : "Your rooms"}
        </h2>
        {waiting > 0 && (
          <p className="text-[15px] text-ink" aria-live="polite">
            {waiting === 1 ? "One room is waiting for you" : `${waiting} rooms are waiting for you`}
          </p>
        )}
      </div>

      {list.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 notch bg-alert-bg px-4 py-3 text-[15px] text-alert">
          <span>
            Your rooms could not be read{list.updatedAt ? `; showing the reading from ${new Date(list.updatedAt).toLocaleTimeString()}` : ""}.{" "}
            {list.error.message}
          </span>
          <Button size="sm" variant="quiet" className="text-alert" onClick={() => void list.refresh()}>
            Try again
          </Button>
        </div>
      )}

      {list.loading && !list.data && <p className="text-[15px] text-muted">Reading your rooms…</p>}

      {list.data && sorted.length === 0 && (
        <div className="notch notch-lg slab bg-surface p-6">
          <p className="text-[15px] text-muted">{practice ? "No practice rooms yet." : "No rooms yet."}</p>
        </div>
      )}

      {list.data && sorted.length > 0 && open.length === 0 && (
        <div className="notch notch-lg slab bg-surface p-6">
          <p className="text-[15px] text-muted">No open rooms.</p>
        </div>
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {open.map((r) => (
            <RoomRow key={r.id} room={r} me={me} now={now} venue={venue} tokens={tokens} />
          ))}
        </ul>
      )}

      {invitations.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-pixel text-[2.1rem]">Invitations from new accounts ({invitations.length})</h2>
            <p className="max-w-xl text-[15px] text-muted">
              Rooms opened for you by accounts you have not traded with. Nothing leaves your wallet unless you put it in; check every item before you do.
            </p>
          </div>
          <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
            {invitations.map((r) => (
              <RoomRow key={r.id} room={r} me={me} now={now} venue={venue} tokens={tokens} stranger />
            ))}
          </ul>
        </div>
      )}

      {closed.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          <h2 className="font-pixel text-[2.1rem]">Closed rooms</h2>
          <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
            {(showAll ? closed : closed.slice(0, CLOSED_SHOWN)).map((r) => (
              <RoomRow key={r.id} room={r} me={me} now={now} venue={venue} tokens={tokens} />
            ))}
          </ul>
          {closed.length > CLOSED_SHOWN && (
            <Button variant="quiet" size="sm" className="w-fit" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer" : `Show all ${closed.length} closed rooms`}
            </Button>
          )}
        </div>
      )}

      {list.data?.more && <p className="text-sm text-muted">Showing your newest 50 rooms.</p>}
    </section>
  );
}

function RoomRow({
  room,
  me,
  now,
  venue,
  tokens,
  stranger = false,
}: {
  room: Room;
  me: string | null;
  now: number;
  venue: Venue;
  tokens: Map<string, TokenInfo>;
  /** Opened by an account you never traded with. */
  stranger?: boolean;
}) {
  const role = roleOf(room, me) ?? "maker";
  const other = role === "maker" ? "taker" : "maker";
  const state = stranger ? { text: "Not opened by you: look before you put anything in", attention: false, closed: false } : roomState(room, me, now);
  const otherSide = room[other];
  const expires = expiresText(room, now);
  // A named price stands in for the side that has not put anything in yet.
  const priced = standingOffer(room);
  const give = priced && role === "taker" ? `${assetsSummary(room.want, tokens)}, their price` : assetsSummary(room[role].assets, tokens, "Nothing yet");
  const get = priced && role === "maker" ? `${assetsSummary(room.want, tokens)}, your price` : assetsSummary(otherSide.assets, tokens, "Nothing yet");

  return (
    <li>
      <Link
        href={`${venue.base}/${room.id}`}
        className={cx(
          "grid gap-x-6 gap-y-3 px-5 py-4 transition-colors duration-150 sm:grid-cols-2 xl:grid-cols-[8.5rem_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(15rem,1.25fr)]",
          state.attention ? "bg-raise hover:bg-[#2b3430]" : "bg-surface hover:bg-control",
          state.closed && "text-muted",
        )}
      >
        <div className="flex flex-col gap-0.5 sm:col-span-2 xl:col-span-1">
          <span className="font-medium text-ink">Room {room.id}</span>
          <span className="text-sm text-muted">
            {otherSide.address ? (
              <>
                with <Address value={otherSide.address} />
              </>
            ) : (
              "Open seat"
            )}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">You give</span>
          <span className="tabular text-[15px]">{give}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted">You get</span>
          <span className="tabular text-[15px]">{get}</span>
        </div>
        <div className="flex items-start gap-3 sm:col-span-2 xl:col-span-1">
          {!state.closed && (
            <span className="flex shrink-0 gap-1 pt-0.5" aria-hidden>
              <Lamp side="maker" lit={lockedNow(room.maker, room)} className="h-5 w-5" />
              <Lamp side="taker" lit={lockedNow(room.taker, room)} className="h-5 w-5" />
            </span>
          )}
          <span className="flex flex-col gap-0.5">
            <span className={cx("text-[15px]", state.attention ? "font-medium text-ink" : "text-muted")}>{state.text}</span>
            {room.openMarket && !state.closed && <span className="text-sm font-medium text-alert">Open market: unverified assets allowed</span>}
            {expires && <span className="text-sm text-muted">{expires}</span>}
          </span>
        </div>
      </Link>
    </li>
  );
}

/* Opening a room */

function OpenRoomForm({ kind, venue, me, ready, invite }: { kind: VenueKind; venue: Venue; me: string | null; ready: boolean; invite: string }) {
  const practice = kind === "practice";
  const router = useRouter();
  const [mode, setMode] = useState<"invite" | "open">("invite");
  const [address, setAddress] = useState(invite);
  const [touched, setTouched] = useState(invite !== "");
  const [minutes, setMinutes] = useState(24 * 60);
  const [market, setMarket] = useState<"verified" | "open">("verified");
  const [busy, setBusy] = useState(false);
  const fee = usePolled(`${kind}:fee`, (signal) => venue.feeBps(signal), 0);
  const [failure, setFailure] = useState<string | null>(null);
  const paused = usePolled(!practice ? "rooms:stats" : null, (signal) => roomsApi.stats(signal), 60_000);
  const isPaused = !!paused.data?.paused;

  const check = !practice && mode === "invite" ? checkAddress(address) : null;
  const self = check?.ok && me && check.address === me;
  const addressError = !check || check.ok ? (self ? "That is your own address" : null) : check.reason;
  const blocked = (!practice && mode === "invite" && (!!addressError || !check?.ok)) || isPaused;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    if (blocked) return;
    const counterparty = practice ? (mode === "invite" ? PRACTICE_PARTNER : "") : mode === "invite" && check?.ok ? check.address : "";
    setBusy(true);
    try {
      const id = await venue.open(counterparty, minutes, market === "open");
      toast(practice ? `Practice room ${id} is open` : `Room ${id} is open`, { tone: "done" });
      router.push(`${venue.base}/${id}`);
    } catch (err) {
      if (err instanceof WalletError && err.kind === "rejected") toast("Cancelled in Adena");
      else setFailure(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={practice ? "Open a practice room" : "Open a room"} className="flex flex-col gap-5 notch notch-lg slab bg-surface p-5 sm:p-6" noValidate>

      {isPaused && (
        <p role="status" className="notch bg-alert-bg px-4 py-3 text-[15px] text-alert">
          New rooms are paused. Open rooms can still be withdrawn from and cancelled.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Who takes the other seat</span>
        <Segmented
          label="Who takes the other seat"
          value={mode}
          onChange={setMode}
          options={
            practice
              ? [
                  { value: "invite", label: "The trader" },
                  { value: "open", label: "Anyone with the link" },
                ]
              : [
                  { value: "invite", label: "One account" },
                  { value: "open", label: "Anyone with the link" },
                ]
          }
        />
      </div>

      {!practice && mode === "invite" && (
        <Field label="Their gno.land address" error={touched ? addressError : null}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => address && setTouched(true)}
              placeholder="g1…"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-sm"
            />
          )}
        </Field>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">What the room takes</span>
        <Segmented
          label="What the room takes"
          value={market}
          onChange={setMarket}
          options={[
            { value: "verified", label: "Verified assets" },
            { value: "open", label: "Open market" },
          ]}
        />
        {market === "verified" ? (
          <p className="text-[13px] text-muted">GNOT, wrapped GNOT and the tokens and NFTs on the verified list.</p>
        ) : (
          <p className="notch bg-alert-bg px-4 py-3 text-[14px] text-alert">
            Any registered token or NFT, and nobody checks them. Anyone can register a token called GNOT or USDC. Choose this only for an asset you
            both know by its full path. {practice ? "" : "Adena will show the call as OpenMarket."}
          </p>
        )}
      </div>

      <Field label="Open for" hint="Deposits can still be taken back after that.">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {LIFETIMES.map((l) => (
              <option key={l.minutes} value={l.minutes}>
                {l.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {fee.data !== null && fee.data > 0 && (
        <p className="text-[13px] text-muted">
          {feePercent(fee.data)} of each coin and token that crosses goes to the service. NFTs, take-backs and cancellations are free.
        </p>
      )}

      {failure && (
        <p role="alert" className="text-[15px] text-alert">
          The room was not opened: {failure}
        </p>
      )}

      {ready ? (
        <Button type="submit" variant="primary" busy={busy} busyLabel={practice ? "Opening…" : "Confirm in Adena…"} disabled={isPaused}>
          {practice ? "Open practice room" : "Open room"}
        </Button>
      ) : (
        <WalletButton block />
      )}

    </form>
  );
}

function GoToRoom({ venue }: { venue: Venue }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const n = value.trim();
  const valid = /^[1-9]\d{0,15}$/.test(n);
  return (
    <form
      className="flex flex-col gap-3 notch notch-lg slab bg-surface p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`${venue.base}/${n}`);
      }}
    >
      <Field label="Go to a room by its number">
        {({ id }) => (
          <div className="flex gap-2">
            <Input id={id} inputMode="numeric" autoComplete="off" placeholder="12" value={value} onChange={(e) => setValue(e.target.value)} className="tabular" />
            <Button type="submit" variant="secondary" disabled={!valid}>
              Go
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}

/* Practising a named price */

function PracticePrice() {
  const router = useRouter();
  const [busy, setBusy] = useState<"make" | "fill" | null>(null);
  const go = async (mode: "make" | "fill") => {
    setBusy(mode);
    try {
      const id = await openPracticeOffer(mode);
      router.push(`/practice/${id}`);
    } catch (e) {
      toast("The practice room was not opened", { tone: "error", body: e instanceof Error ? e.message : String(e) });
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="price-title" className="flex flex-col gap-4 notch notch-lg slab bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 id="price-title" className="font-pixel text-[2.1rem]">
          Trade at a named price
        </h2>
        <p className="text-[15px] text-muted">One side puts their items in and names a price; the other accepts it in one step, and the trade completes.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" busy={busy === "make"} disabled={busy !== null} onClick={() => void go("make")}>
          Name your price to the trader
        </Button>
        <Button variant="secondary" busy={busy === "fill"} disabled={busy !== null} onClick={() => void go("fill")}>
          Accept the trader&apos;s price
        </Button>
      </div>
    </section>
  );
}

/* Balances */

function useBalance(venue: Venue, address: string, kind: "coin" | "token", denom: string, intervalMs: number) {
  return usePolled(
    `${venue.kind}:balance:${address}:${kind}:${denom}`,
    async (signal) => (await venue.balance(address, kind, denom, signal)).balance,
    intervalMs,
    venue.kind === "practice",
  );
}

function PracticeBalances({ venue }: { venue: Venue }) {
  const gnot = useBalance(venue, PRACTICE_ME, "coin", "ugnot", 0);
  const wrapped = useBalance(venue, PRACTICE_ME, "token", WUGNOT_KEY, 0);
  const moss = useBalance(venue, PRACTICE_ME, "token", MOSS_KEY, 0);
  const pebbles = useBalance(venue, PRACTICE_ME, "token", PEBBLES_KEY, 0);
  const items = usePolled(`${venue.kind}:inventory:${PRACTICE_ME}`, (signal) => venue.inventory(PRACTICE_ME, signal), 0, true);
  const tokens = usePolled(`${venue.kind}:tokens`, async (signal) => new Map((await venue.tokens(signal)).map((t) => [t.key, t])), 0);
  const nfts = items.data?.filter((i) => i.kind === "nft").map((i) => assetLabel(assetMeta("nft", i.denom, tokens.data ?? undefined))) ?? null;
  const [confirm, setConfirm] = useState(false);

  return (
    <section aria-labelledby="play-title" className="flex flex-col gap-4 notch notch-lg slab bg-surface p-5 sm:p-6">
      <h2 id="play-title" className="font-pixel text-[2.1rem]">
        Play balances
      </h2>
      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[15px] text-muted">GNOT</dt>
          <dd className="tabular text-lg font-medium">{gnot.data === null ? "…" : formatUnits(gnot.data, 6)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[15px] text-muted">Wrapped GNOT</dt>
          <dd className="tabular text-lg font-medium">{wrapped.data === null ? "…" : formatUnits(wrapped.data, 6)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[15px] text-muted">Moss</dt>
          <dd className="tabular text-lg font-medium">{moss.data === null ? "…" : formatUnits(moss.data, 6)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[15px] text-muted">
            Pebbles <span className="text-alert">not verified</span>
          </dt>
          <dd className="tabular text-lg font-medium">{pebbles.data === null ? "…" : formatUnits(pebbles.data, 6)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[15px] text-muted">NFTs</dt>
          <dd className="text-right text-[15px] font-medium">{nfts === null ? "…" : nfts.length === 0 ? "None" : nfts.join(", ")}</dd>
        </div>
      </dl>
      {!confirm ? (
        <Button variant="quiet" size="sm" className="-ml-3.5 w-fit" onClick={() => setConfirm(true)}>
          Start over
        </Button>
      ) : (
        <div className="flex flex-col gap-2 notch bg-ground/50 p-3">
          <p className="text-[15px]">Delete every practice room and reset the balances?</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                resetPractice();
                setConfirm(false);
                toast("Practice reset", { tone: "done" });
              }}
            >
              Yes, start over
            </Button>
            <Button variant="quiet" size="sm" onClick={() => setConfirm(false)}>
              Keep them
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function TestnetBalance({ venue, me }: { venue: Venue; me: string }) {
  const w = useWallet();
  const gnot = useBalance(venue, me, "coin", "ugnot", 20_000);
  const low = gnot.data !== null && gnot.data < 5_000_000n;
  if (!w.account) return null;
  return (
    <section aria-labelledby="balance-title" className="flex flex-col gap-2 notch notch-lg slab bg-surface p-5 sm:p-6">
      <h2 id="balance-title" className="text-sm text-muted">
        Your GNOT on {network.name}
      </h2>
      <p className="tabular text-2xl font-semibold">{gnot.data === null ? (gnot.error ? "Not readable" : "…") : formatUnits(gnot.data, 6)}</p>
      {!isMainnet && (
        <p className="text-[13px] text-muted">
          {low ? "That is low for fees. " : ""}
          Test GNOT is free from the{" "}
          <a className="text-ink underline underline-offset-4" href="https://faucet.gno.land" target="_blank" rel="noreferrer">
            gno.land faucet
          </a>
          .
        </p>
      )}
    </section>
  );
}
