"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { assetLabel, assetMeta, assetsSummary, formatUnits } from "@/lib/chain/assets";
import { gnowebUrl, network, realms, roomsDeployed } from "@/lib/chain/config";
import { feePercent, feeSplit } from "@/lib/chain/fee";
import { ChainError } from "@/lib/chain/rpc";
import type { Asset, Room, TokenInfo } from "@/lib/chain/types";
import { lockedNow, roleOf, standingOffer } from "@/lib/chain/types";
import { cx } from "@/lib/cx";
import { ago, duration, shortAddress, when } from "@/lib/format";
import { diffRooms, useNow, usePolled, useRoom, useVerified } from "@/lib/hooks";
import { PRACTICE_PARTNER } from "@/lib/venue/practice";
import type { InventoryItem, Offer, VenueKind } from "@/lib/venue/types";
import { useVenue } from "@/lib/venue/use-venue";
import { WalletError } from "@/lib/wallet/adena";
import { useWallet } from "@/lib/wallet/store";
import { Button, buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { toast } from "@/components/ui/toast";
import { WalletButton } from "@/components/wallet/wallet-button";
import { AmountPicker, ANY } from "./amount-picker";
import { ConfirmDialog, type ConfirmMode } from "./confirm-dialog";
import { itemLook, itemName, keyOf, SLOTS, trustOf } from "./items";
import { OfferPanel, type Marks } from "./offer-panel";
import type { StageSide, StageState } from "./stage";
import { TradeChat } from "./trade-chat";
import { TradeStage, type Plate } from "./trade-stage";
import { WalletDialog } from "./wallet-dialog";

type SideName = "maker" | "taker";
type TakeBack = { kind: Asset["kind"]; denom: string };

/** A control that sits on the scene: a solid dark tile, never a bare link. */
const sceneControl =
  "inline-flex h-10 w-fit items-center gap-2 notch bg-ground/75 px-3.5 text-[14px] font-medium text-ink transition-colors duration-150 hover:bg-ground";

/** Fees on chain need a little GNOT; Max keeps this much back. */
const FEE_RESERVE = 2_000_000n;
/** How far the window's panels reach up over the scene on wide screens. */
const OVERLAP = 120;

function useTokens(load: () => Promise<TokenInfo[]>, key: string) {
  const res = usePolled(key, async () => new Map((await load()).map((t) => [t.key, t])), 0);
  return res.data ?? new Map<string, TokenInfo>();
}

function readInspected(storageKey: string): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

const count = (n: number) => (n === 1 ? "1 item" : `${n} items`);
const asAssets = (items: Offer[]): Asset[] => items.map((o) => ({ kind: o.kind, denom: o.denom, amount: String(o.amount) }));

/** Whether a standing price waits on this account. */
function priceFor(room: Room | null, me: string | null): boolean {
  if (!room || !me || !standingOffer(room) || me === room.maker.address) return false;
  return room.taker.address === me || (room.taker.address === "" && room.openSeat);
}

/**
 * The trade window, laid out the way an MMO lays one out: the scene of the
 * trade, both bags side by side under it, and the trade bar across the
 * bottom, docked in view on wide screens.
 */
export function TradeWindow({ kind, id }: { kind: VenueKind; id: number }) {
  const { venue, me, ready } = useVenue(kind);
  const w = useWallet();
  const practice = kind === "practice";
  const { data: room, error, loading, refresh } = useRoom(venue, id);
  const tokens = useTokens(() => venue.tokens(), `${kind}:tokens`);
  const verified = useVerified(venue);
  const now = useNow();

  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<Offer[]>([]);
  const [price, setPrice] = useState<Offer[]>([]);
  const [walletOpen, setWalletOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [takeBack, setTakeBack] = useState<TakeBack | null>(null);
  const [confirm, setConfirm] = useState<ConfirmMode | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const inspectedKey = `tw.inspected.${kind}.${id}`;
  const [inspected, setInspected] = useState<Record<string, string>>(() => (typeof window === "undefined" ? {} : readInspected(inspectedKey)));
  const [marks, setMarks] = useState<Marks>({ deltas: {}, removed: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const prev = useRef<Room | null>(null);
  // The title rides over the scene's top on wide screens; the scene frames
  // the bridge below it. Without WebGL the page closes up instead.
  const head = useRef<HTMLDivElement>(null);
  const [headHeight, setHeadHeight] = useState(0);
  const [sceneless, setSceneless] = useState(false);
  const loaded = !!room;
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadHeight(Math.round(el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const role = room ? roleOf(room, me) : null;
  const party = role !== null;
  const wantsMe = priceFor(room, me);
  const open = room?.status === "open";
  const inventory = usePolled<InventoryItem[]>(
    ready && me && (party || wantsMe) && open ? `${kind}:inventory:${me}` : null,
    (signal) => venue.inventory(me as string, signal),
    practice ? 0 : 15_000,
    practice,
  );
  // What the other side holds, read only while a price is being written for a named account.
  const them = role === "maker" ? (room?.taker.address ?? "") : "";
  const theirs = usePolled<InventoryItem[]>(asking && them ? `${kind}:inventory:${them}` : null, (signal) => venue.inventory(them, signal), 0, practice);
  // Prices for an open seat name what can be asked for: coins and registered tokens. NFTs need a named holder.
  const catalogue = useMemo<InventoryItem[]>(
    () => [
      { kind: "coin", denom: "ugnot", balance: ANY },
      ...[...tokens.values()].filter((t) => !t.nft).map((t) => ({ kind: "token" as const, denom: t.key, balance: ANY })),
    ],
    [tokens],
  );
  // Rooms this account traded in before: a first trade with someone says so.
  const history = usePolled(!practice && ready && me && party ? `${kind}:history:${me}` : null, (signal) => venue.roomsOf(me as string, signal), 60_000);

  useEffect(() => {
    try {
      sessionStorage.setItem(inspectedKey, JSON.stringify(inspected));
    } catch {
      // looking again after a reload is the safe default
    }
  }, [inspected, inspectedKey]);

  // Watch the other side, like a trade window does: changes are marked on
  // the items, removed items leave a red trace, and a ready mark that a
  // change cleared is said out loud.
  useEffect(() => {
    if (!room) return;
    const before = prev.current;
    prev.current = room;
    if (!before || before.id !== room.id) return;
    const mine = roleOf(room, me);
    if (!mine) return;
    const theirSide = mine === "maker" ? "taker" : "maker";
    if (room.version > before.version) {
      const changes = diffRooms(before, room).filter((c) => c.side === theirSide);
      const assetChanges = changes.flatMap((c) => (c.type === "asset" ? [c] : []));
      if (assetChanges.length && before[theirSide].assets.length > 0) {
        setMarks((m) => {
          const deltas = { ...m.deltas };
          let removed = [...m.removed];
          for (const c of assetChanges) {
            const key = keyOf(c.asset);
            if (c.after === 0n) {
              delete deltas[key];
              removed = [...removed.filter((r) => keyOf(r) !== key), { kind: c.asset.kind, denom: c.asset.denom, amount: String(c.before) }];
            } else {
              deltas[key] = { before: m.deltas[key]?.before ?? c.before, after: c.after };
              removed = removed.filter((r) => keyOf(r) !== key);
            }
          }
          return { deltas, removed };
        });
        const cleared = lockedNow(before[mine], before) && !lockedNow(room[mine], room);
        setNotice(
          cleared
            ? "They changed their offer, so your ready mark was cleared. Look at the marked items again."
            : "They changed their offer. Look at the marked items.",
        );
      }
      const joined = changes.find((c) => c.type === "joined");
      if (joined && joined.type === "joined") toast(`${shortAddress(joined.address)} took the other seat`);
      if (before.want.length > 0 && room.want.length === 0 && room.status === "open" && mine === "taker") toast("They took their price down");
    }
    if (room.status === "open" && !lockedNow(before[theirSide], before) && lockedNow(room[theirSide], room) && room.want.length === 0) {
      toast(`They are ready on version ${room.version}`);
    }
    if (before.status === "open" && room.status === "cancelled") toast("Trade cancelled", { body: "Every item went back to its owner." });
  }, [room, me]);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>, done?: string) => {
      setBusy(true);
      try {
        await fn();
        if (done) toast(done, { tone: "done" });
        await refresh();
        return true;
      } catch (e) {
        if (e instanceof WalletError && e.kind === "rejected") toast("Cancelled in Adena");
        else if (e instanceof WalletError && e.kind === "unknown-outcome") {
          toast("Not confirmed yet", { tone: "error", body: `${e.message} The trade is being read again before anything else.` });
        } else toast(`${label} did not go through`, { tone: "error", body: e instanceof Error ? e.message : String(e) });
        await refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const lookAt = useCallback((a: Asset) => {
    const key = keyOf(a);
    setInspected((m) => (m[key] === a.amount ? m : { ...m, [key]: a.amount }));
    setMarks((m) => {
      if (!(key in m.deltas)) return m;
      const deltas = { ...m.deltas };
      delete deltas[key];
      return { ...m, deltas };
    });
  }, []);

  if (loading && !room) {
    return (
      <div className="shell flex flex-col gap-4 py-10 lg:py-14" aria-busy>
        <p className="font-pixel text-[clamp(3.25rem,2.2rem+3.4vw,6rem)] text-muted">Trade {id}</p>
        <p className="text-muted">Opening the trade…</p>
      </div>
    );
  }

  if (!room) {
    const notDeployed = error instanceof ChainError && error.kind === "not-deployed";
    return (
      <div className="shell flex flex-col items-start gap-4 py-10 lg:py-14">
        <h1 className="font-pixel text-[clamp(3.25rem,2.2rem+3.4vw,6rem)]">Trade {id}</h1>
        <p className="max-w-xl text-muted">
          {error
            ? notDeployed
              ? "Trades are not live on this network yet."
              : `This trade could not be read: ${error.message}`
            : "There is no trade with this number."}
        </p>
        <div className="flex gap-3">
          {error && !notDeployed && (
            <Button variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          )}
          <Link href={venue.base} className={buttonClass("secondary", "md")}>
            Back to your rooms
          </Link>
        </div>
      </div>
    );
  }

  const expired = open && now >= room.expiresAt;
  const live = open && !expired;
  // Who the page speaks to: a party, or an account a standing price is open to.
  const seat: SideName | null = role ?? (wantsMe ? "taker" : null);
  const other: SideName | null = seat === "maker" ? "taker" : seat === "taker" ? "maker" : null;
  const meReady = role ? lockedNow(room[role], room) : false;
  const theyReady = role && other ? lockedNow(room[other], room) : false;
  const left: SideName = seat ?? "maker";
  const right: SideName = left === "maker" ? "taker" : "maker";
  const offerUp = standingOffer(room);
  const canJoin = live && room.openSeat && !room.taker.address && !!me && me !== room.maker.address && !offerUp;
  const myAssets = role ? room[role].assets : [];
  const theirAssets = role && other ? room[other].assets : [];
  const unseen = theirAssets.filter((a) => inspected[keyOf(a)] !== a.amount);
  // The change notice has done its job once every marked item has been looked at.
  const marked = unseen.length > 0 || Object.keys(marks.deltas).length > 0 || marks.removed.length > 0;
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const canAct = party && ready;
  // While a price stands, the room is the price: changing a side would take it down.
  const canEdit = canAct && live && !offerUp;
  // The maker hands out the link until the other side has put something in.
  const inviting = !practice && live && role === "maker" && room.taker.assets.length === 0;

  // An ordinary room holding an asset that lost its verification cannot settle; say which, and how out.
  const lapsed =
    live && !room.openMarket && verified
      ? [...room.maker.assets, ...room.taker.assets, ...room.want].find((a) => trustOf(a, verified)?.verified === false)
      : undefined;
  const lapsedName = lapsed ? itemName(lapsed, assetMeta(lapsed.kind, lapsed.denom, tokens)) : "";

  // Getting ready means something once both seats are taken and the trade
  // can still complete; before that the button stays out of the way. When
  // it is there but cannot be pressed, one line says why.
  const showReady = live && canAct && !meReady && !offerUp && !!room.maker.address && !!room.taker.address && theirAssets.length > 0;
  const blocked = !showReady
    ? null
    : lapsed
      ? "This trade cannot complete."
      : staged.length > 0
        ? "Put your items in the window first."
        : myAssets.length === 0
          ? "Add something to give first."
          : unseen.length > 0
            ? unseen.length === 1
              ? "Look at their item first."
              : "Look at their items first."
            : null;
  const canReady = showReady && blocked === null;

  // A named price: the maker writes it, the other side accepts it in one step.
  const canPrice = live && canAct && role === "maker" && !offerUp && myAssets.length > 0 && room.taker.assets.length === 0 && staged.length === 0 && !lapsed;
  const canFill = live && ready && wantsMe;
  const short = canFill && inventory.data ? room.want.find((a) => (inventory.data?.find((i) => keyOf(i) === keyOf(a))?.balance ?? 0n) < BigInt(a.amount)) : undefined;
  const fillBlocked = !canFill
    ? null
    : lapsed
      ? "This trade cannot complete."
      : party && unseen.length > 0
        ? unseen.length === 1
          ? "Look at their item first."
          : "Look at their items first."
        : short
        ? short.kind === "nft"
          ? `${itemName(short, assetMeta(short.kind, short.denom, tokens))} is not in your wallet.`
          : `You need ${itemName(short, assetMeta(short.kind, short.denom, tokens))} for this.`
        : null;
  const priceShown: Asset[] = offerUp ? room.want : role === "maker" && live ? asAssets(price) : [];

  // Items that can still go in: what is in the window plus what is staged must fit eight slots.
  const slotKeys = new Set([...myAssets.map(keyOf), ...staged.map(keyOf)]);
  const isFull = (item: Pick<Asset, "kind" | "denom">) => !slotKeys.has(keyOf(item)) && slotKeys.size >= SLOTS;
  const priceFull = (item: Pick<Asset, "kind" | "denom">) => !price.some((p) => keyOf(p) === keyOf(item)) && price.length >= SLOTS;
  const refuse = (item: InventoryItem) =>
    !room.openMarket && trustOf(item, verified)?.verified === false ? "Not verified: only open-market rooms take it. Open one if you both accept the risk." : null;

  const stage = (o: Offer) =>
    setStaged((s) => {
      const i = s.findIndex((x) => keyOf(x) === keyOf(o));
      if (i >= 0) return s.map((x, j) => (j === i ? { ...x, amount: x.amount + o.amount } : x));
      return [...s, o];
    });
  const ask = (o: Offer) =>
    setPrice((s) => {
      const i = s.findIndex((x) => keyOf(x) === keyOf(o));
      if (i >= 0) return s.map((x, j) => (j === i ? { ...x, amount: x.amount + o.amount } : x));
      return [...s, o];
    });

  const takeMeta = takeBack ? assetMeta(takeBack.kind, takeBack.denom, tokens) : null;
  const takeInWindow = takeBack ? myAssets.find((a) => a.kind === takeBack.kind && a.denom === takeBack.denom) : undefined;

  // The scene and its nameplates.
  const nameOf = (s: SideName) => {
    const addr = room[s].address;
    if (seat === s && role) return "You";
    if (!addr) return seat === s ? "You" : "Open seat";
    if (practice && addr === PRACTICE_PARTNER) return "Gnome trader";
    return shortAddress(addr);
  };
  // A nameplate carries a name, and "Ready" while that side is ready; every
  // other state is said once, in the page.
  const plateOf = (s: SideName): Plate => {
    if (!room[s].address) return { name: nameOf(s), tone: "muted" };
    if (room.status === "settled") return { name: nameOf(s), tone: s };
    if (live && lockedNow(room[s], room)) return { name: nameOf(s), note: offerUp && s === "maker" ? "Named a price" : "Ready", tone: s };
    return { name: nameOf(s), tone: "muted" };
  };
  const stateOf = (s: SideName) =>
    !room[s].address
      ? "waiting for someone"
      : room.status === "settled"
        ? "traded"
        : room.status === "cancelled"
          ? "cancelled"
          : expired
            ? "expired"
            : lockedNow(room[s], room)
              ? `ready on version ${room.version}`
              : "not ready";
  const stageSide = (s: SideName): StageSide => ({
    side: s,
    present: !!room[s].address,
    ready: lockedNow(room[s], room),
    watched: party && s !== role,
    items: room[s].assets.map((a) => ({ key: keyOf(a), ...itemLook(a, assetMeta(a.kind, a.denom, tokens)) })),
  });
  const stageState: StageState = { left: stageSide(left), right: stageSide(right), version: room.version, status: room.status, expired };
  const plates = { left: plateOf(left), right: plateOf(right) };
  const describe = (s: SideName, p: Plate) => `${p.name}${room[s].address ? `, ${count(room[s].assets.length)} on the bridge` : ""}, ${stateOf(s)}`;
  const stageLabel = `A bridge over a pond in a voxel forest. ${describe(left, plates.left)}; ${describe(right, plates.right)}.`;

  // After settlement each side says what arrived, after the fee.
  const net = (assets: Asset[]) => assets.map((a) => ({ ...a, amount: String(feeSplit(a, room.feeBps).net) }));
  const settledGot = role && room.status === "settled" ? net(room[role === "maker" ? "taker" : "maker"].assets) : [];
  const settledGave = role && room.status === "settled" ? room[role].assets : [];

  // Someone you never traded with: said under their name.
  const counterparty = other ? room[other].address : "";
  const firstTrade =
    !practice && counterparty && history.data
      ? !history.data.rooms.some((r) => r.id !== room.id && r.status === "settled" && (r.maker.address === counterparty || r.taker.address === counterparty))
      : false;

  const titleOf = (s: SideName) =>
    seat === s ? "You give" : seat ? (offerUp && s === "taker" && role === "maker" ? "You ask for" : "You get") : s === "maker" ? "Maker's offer" : "Taker's offer";

  const leftPanel = (
    <OfferPanel
      side={left}
      mine={seat === left}
      title={titleOf(left)}
      address={practice ? "" : room[left].address}
      assets={room[left].assets}
      want={left === "taker" ? priceShown : []}
      staged={role === left ? staged : []}
      ready={live && lockedNow(room[left], room)}
      version={room.version}
      tokens={tokens}
      verified={verified}
      onItem={role === left && open && ready && !offerUp ? (a) => setTakeBack({ kind: a.kind, denom: a.denom }) : undefined}
      onStaged={(o) => setStaged((s) => s.filter((x) => keyOf(x) !== keyOf(o)))}
      footer={
        role === left && canEdit && staged.length > 0 ? (
          <Button variant="quiet" className="-ml-3.5 w-fit" onClick={() => setStaged([])}>
            Clear what is not sent
          </Button>
        ) : null
      }
      // The side's next step sits beside its title, where the docked trade bar never covers it.
      action={
        role === left && canEdit && !takeBack ? (
          staged.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="quiet" onClick={() => setWalletOpen(true)}>
                Add more
              </Button>
              <Button
                variant="primary"
                busy={busy}
                busyLabel={practice ? "Putting in…" : "Confirm in Adena…"}
                onClick={async () => {
                  const items = staged;
                  const ok = await run("Putting items in", () => venue.depositMany(room.id, items), items.length === 1 ? "Item put in the window" : `${items.length} items put in the window`);
                  if (ok) setStaged([]);
                }}
              >
                Put {staged.length === 1 ? "it" : `all ${staged.length}`} in the window
              </Button>
            </div>
          ) : (
            <Button variant={myAssets.length === 0 ? "primary" : "secondary"} onClick={() => setWalletOpen(true)}>
              Add from your wallet
            </Button>
          )
        ) : null
      }
    >
      {takeBack && takeMeta && role === left && open && takeBack.kind === "nft" && (
        <div
          ref={(el) => {
            el?.scrollIntoView({ block: "nearest" });
          }}
          className="flex scroll-mb-40 flex-col gap-4 notch bg-ground/55 p-4 sm:p-5"
        >
          <p className="text-[15px] font-semibold">Take {assetLabel(takeMeta)} back?</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              busy={busy}
              onClick={async () => {
                const ok = await run("Taking back", () => venue.withdraw(room.id, { kind: takeBack.kind, denom: takeBack.denom }, 1n), `Took back ${assetLabel(takeMeta)}`);
                if (ok) setTakeBack(null);
              }}
            >
              Take back
            </Button>
            <Button variant="quiet" onClick={() => setTakeBack(null)}>
              Never mind
            </Button>
          </div>
        </div>
      )}
      {takeBack && takeMeta && role === left && open && takeBack.kind !== "nft" && (
        <AmountPicker
          key={`take:${takeBack.kind}:${takeBack.denom}`}
          meta={takeMeta}
          verb="take"
          max={BigInt(takeInWindow?.amount ?? "0")}
          initial={BigInt(takeInWindow?.amount ?? "0")}
          busy={busy}
          confirmLabel="Take back"
          onCancel={() => setTakeBack(null)}
          onConfirm={async (amount) => {
            const ok = await run(
              "Taking back",
              () => venue.withdraw(room.id, { kind: takeBack.kind, denom: takeBack.denom }, amount),
              `Took back ${formatUnits(amount, takeMeta.decimals)} ${assetLabel(takeMeta)}`,
            );
            if (ok) setTakeBack(null);
          }}
        />
      )}
      {canFill && seat === left && (
        <p className="text-[14px] text-muted">
          This is what they ask for. Accepting puts it in and completes the trade in the same step.
        </p>
      )}
    </OfferPanel>
  );

  const rightPanel = (
    <OfferPanel
      side={right}
      mine={seat === right}
      title={titleOf(right)}
      address={practice ? "" : room[right].address}
      note={firstTrade ? "First trade with this account." : undefined}
      assets={room[right].assets}
      want={right === "taker" ? priceShown : []}
      ready={live && lockedNow(room[right], room) && !(offerUp && right === "maker" && seat !== null)}
      version={room.version}
      tokens={tokens}
      verified={verified}
      feeBps={seat ? room.feeBps : undefined}
      inspected={party && live ? inspected : undefined}
      marks={party ? marks : undefined}
      onLook={party ? lookAt : undefined}
      onDismissRemoved={(a) => setMarks((m) => ({ ...m, removed: m.removed.filter((r) => keyOf(r) !== keyOf(a)) }))}
      footer={
        role === "maker" && right === "taker" && live && !offerUp && price.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" busy={busy} onClick={() => setConfirm("price")}>
              Put up this price
            </Button>
            <Button variant="quiet" onClick={() => setAsking(true)}>
              Ask for more
            </Button>
            <Button variant="quiet" onClick={() => setPrice([])}>
              Clear
            </Button>
          </div>
        ) : null
      }
    >
      {live && room[right].assets.length === 0 && priceShown.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[15px] text-muted">
            {!room[right].address ? "Waiting for someone to join." : practice ? "The gnome trader is choosing what to offer…" : "Nothing offered yet."}
          </p>
          {inviting && pageUrl && <CopyButton text={pageUrl} label="Copy invite link" done="Link copied" className={buttonClass("secondary", "md")} />}
        </div>
      )}
      {role === "maker" && offerUp && inviting && pageUrl && (
        <CopyButton text={pageUrl} label="Copy invite link" done="Link copied" className={cx(buttonClass("secondary", "md"), "w-fit")} />
      )}
    </OfferPanel>
  );

  // The trade bar: on the left what the room waits for and why, on the right
  // the buttons, secondary ones first and the one main action last, the way
  // a game lays out Cancel and Accept.
  const notes: ReactNode[] = [];
  const actions: ReactNode[] = [];
  if (notice && marked && party && live) {
    notes.push(
      <div key="notice" role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 notch bg-alert-bg px-4 py-3 text-alert">
        <p className="text-[15px] font-medium">{notice}</p>
        <Button variant="secondary" size="sm" className="bg-ground/40 text-alert hover:bg-ground/60" onClick={() => setNotice(null)}>
          Got it
        </Button>
      </div>,
    );
  }
  if (lapsed) {
    notes.push(
      <p key="lapsed" role="alert" className="text-[15px] font-medium text-alert">
        {lapsedName} is no longer verified, so this trade cannot complete. Take your items back; nothing else can move them.
      </p>,
    );
  }
  if (!practice && !ready && open) {
    notes.push(
      <p key="wallet" className="text-[15px] text-frost">
        {w.status === "connected" ? "Your wallet is on another network." : "Connect Adena to trade."}
      </p>,
    );
    actions.push(<WalletButton key="wallet" />);
  }
  if (live && offerUp && role === "maker") {
    notes.push(
      <p key="priced" className="text-[15px] text-frost">
        {room.taker.address ? "They" : "Anyone with the link"} can accept it in one step.
      </p>,
    );
    actions.push(
      <Button key="priced" variant="secondary" size="lg" busy={busy} onClick={() => void run("Taking the price down", () => venue.unlock(room.id), "Price taken down")}>
        Take the price down
      </Button>,
    );
  }
  if (live && offerUp && !party && !wantsMe && me && me !== room.maker.address) {
    notes.push(
      <p key="not-yours" className="text-[15px] text-frost">
        This price is for another account.
      </p>,
    );
  }
  if (canPrice) {
    notes.push(
      <p key="price" className="text-[15px] text-frost">
        Name a price: ask for exactly what you want, and they accept in one step.
      </p>,
    );
    actions.push(
      <Button key="price" variant="secondary" size="lg" onClick={() => setAsking(true)}>
        {price.length > 0 ? "Change your price" : "Name your price"}
      </Button>,
    );
  }
  if (live && canAct && meReady && !offerUp) {
    notes.push(
      <p key="waiting" className="text-[15px] text-frost">
        You are ready on this version.
      </p>,
    );
    actions.push(
      <Button key="waiting" variant="secondary" size="lg" busy={busy} onClick={() => void run("Clearing your ready mark", () => venue.unlock(room.id), "Ready mark cleared")}>
        Not ready any more
      </Button>,
    );
  }
  if (room.status === "settled" && role) {
    notes.push(
      <p key="settled" role="status" className="text-[15px] text-frost">
        You received {assetsSummary(settledGot, tokens)} and gave {assetsSummary(settledGave, tokens)}.
        {room.feeBps > 0 && settledGot.some((a) => a.kind !== "nft") ? ` What you received is after the ${feePercent(room.feeBps)} fee.` : ""}
      </p>,
    );
  }
  if (room.status === "settled" && practice) {
    actions.push(
      <Link key="real" href={roomsDeployed ? "/trade" : "/how"} className={buttonClass("primary", "lg")}>
        {roomsDeployed ? `Trade for real on ${network.name}` : "How it works on chain"}
      </Link>,
    );
  }
  if (room.status === "cancelled") {
    notes.push(
      <p key="cancelled" className="text-[15px] text-frost">
        Every item went back to its owner.
      </p>,
    );
  }
  if (role === null && !wantsMe && live && !canJoin && !offerUp) {
    notes.push(
      <p key="watch" className="text-[15px] text-frost">
        Only the two traders can change this trade.
      </p>,
    );
  }
  // An expired trade can only end one way, so sending everything home needs no second step.
  if (expired && ready) {
    actions.push(
      <Button key="home" variant="primary" size="lg" busy={busy} onClick={() => void run("Sending everything home", () => venue.cancel(room.id), "Trade cancelled")}>
        Send everything home
      </Button>,
    );
  }
  if (live && ready && party && confirmCancel) {
    notes.push(
      <p key="cancel-confirm" className="text-[15px] font-medium text-alert">
        Cancel the trade? Every item goes back to its owner.
      </p>,
    );
    actions.push(
      <Button key="keep" variant="secondary" size="lg" onClick={() => setConfirmCancel(false)}>
        Keep trading
      </Button>,
      <Button
        key="cancel-yes"
        variant="danger"
        size="lg"
        busy={busy}
        onClick={async () => {
          await run("Cancelling", () => venue.cancel(room.id), "Trade cancelled");
          setConfirmCancel(false);
        }}
      >
        Yes, cancel the trade
      </Button>,
    );
  }
  if (live && ready && party && !confirmCancel) {
    actions.push(
      <Button key="cancel" variant="secondary" size="lg" className="text-frost hover:text-alert" onClick={() => setConfirmCancel(true)}>
        Cancel trade
      </Button>,
    );
  }
  // The main action, last.
  if (!confirmCancel) {
    if (canJoin && ready) {
      actions.push(
        <Button key="join" variant="primary" size="lg" busy={busy} busyLabel="Waiting…" onClick={() => void run("Joining", () => venue.join(room.id), "You joined the trade")}>
          Join this trade
        </Button>,
      );
    }
    if (canFill) {
      if (fillBlocked) notes.push(<p key="fill-why" className="text-[15px] text-frost">{fillBlocked}</p>);
      actions.push(
        <Button key="fill" variant="primary" size="lg" disabled={!!fillBlocked || busy} onClick={() => setConfirm("fill")}>
          Accept their price
        </Button>,
      );
    }
    if (showReady) {
      if (blocked) notes.push(<p key="ready-why" className="text-[15px] text-frost">{blocked}</p>);
      actions.push(
        <Button key="ready" variant="primary" size="lg" disabled={!canReady || busy} onClick={() => setConfirm(theyReady ? "trade" : "ready")}>
          {theyReady ? "Trade" : "I am ready"}
        </Button>,
      );
    }
  }
  const fee = live && room.feeBps > 0 ? `${feePercent(room.feeBps)} of each coin and token that crosses goes to the service. NFTs are free.` : null;

  // The booth's headline says what the room waits for; the version sits
  // under it with what it means, since a ready mark names it.
  const headline =
    room.status === "settled"
      ? "Trade complete"
      : room.status === "cancelled"
        ? "Trade cancelled"
        : expired
          ? "Expired"
          : lapsed
            ? "Cannot complete"
            : canJoin
              ? "The seat is free"
              : wantsMe
                ? "Their price"
                : offerUp && role === "maker"
                  ? "Your price is up"
                  : !party
                    ? "Trade under way"
                    : !room[other ?? "taker"].address
                      ? "Waiting for someone"
                      : myAssets.length === 0
                        ? "Your turn"
                        : meReady
                          ? "Waiting for them"
                          : theyReady
                            ? "They are ready"
                            : theirAssets.length === 0
                              ? "Waiting for them"
                              : "Your turn";
  const status = (
    <div className="flex min-w-0 flex-col gap-2">
      <p role="status" className="font-pixel text-balance text-[2.5rem] leading-[0.95] lg:text-[2.75rem]">
        {headline}
      </p>
      {notes}
      <p className="text-[13px] text-muted">
        <span className="text-ink">
          Version{" "}
          <span key={room.version} className="figure-in tabular inline-block">
            {room.version}
          </span>
          .
        </span>{" "}
        {open ? "Every change raises it and clears both ready marks." : "The room's last state."}
      </p>
    </div>
  );

  // The primary action again, fixed to the bottom of a phone screen.
  const dock = canReady ? (
    <>
      <p className="text-[15px]">
        {headline}, version {room.version}
      </p>
      <Button variant="primary" onClick={() => setConfirm(theyReady ? "trade" : "ready")}>
        {theyReady ? "Trade" : "I am ready"}
      </Button>
    </>
  ) : canFill && !fillBlocked ? (
    <>
      <p className="text-[15px]">Their price, version {room.version}</p>
      <Button variant="primary" onClick={() => setConfirm("fill")}>
        Accept
      </Button>
    </>
  ) : null;

  const body = (
    <div className={cx("shell relative z-10 mt-2 grid gap-4 sm:gap-5 md:grid-cols-2 lg:mt-0", sceneless ? "lg:mt-10" : "lg:-mt-[120px]")}>
      {leftPanel}
      {rightPanel}
      {/* The trade bar stays in view at the bottom of a wide screen, the way a game docks its trade button. */}
      <section
        aria-label="The trade"
        className="order-3 grid gap-x-10 gap-y-4 notch notch-lg slab bg-surface p-5 sm:px-6 md:col-span-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center lg:sticky lg:bottom-4 lg:z-20 lg:px-8"
      >
        {status}
        {actions.length > 0 && <div className="flex flex-wrap items-center gap-3 md:justify-end">{actions}</div>}
      </section>
      {/* The two traders talk terms here; only the window settles. */}
      {role && me && (
        <TradeChat
          kind={kind}
          room={room.id}
          me={me}
          open={open}
          walletReady={ready}
          nameOf={(addr) => (addr === me ? "You" : practice && addr === PRACTICE_PARTNER ? "Gnome trader" : shortAddress(addr))}
          sideOf={(addr) => (addr === room.maker.address ? "maker" : addr === room.taker.address ? "taker" : null)}
        />
      )}
      {fee && <p className="order-5 text-[13px] text-muted md:col-span-2">{fee}</p>}
    </div>
  );

  return (
    <div className={cx("flex flex-col pb-16", dock && "pb-28 lg:pb-16")}>
      <div className="relative">
        <div ref={head} className={cx("relative z-10", !sceneless && "lg:absolute lg:inset-x-0 lg:top-0")}>
          <div className="shell flex flex-wrap items-start justify-between gap-x-8 gap-y-3 pt-6 lg:pt-9">
            <div className="flex min-w-0 flex-col gap-4">
              <Link href={venue.base} className={sceneControl}>
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 3.5 5.5 8l4.5 4.5" />
                </svg>
                {practice ? "Practice rooms" : "Your rooms"}
              </Link>
              <div className="flex flex-col gap-1">
                <h1 className="font-pixel text-shadow-scene text-[clamp(3.25rem,2.2rem+3.4vw,6rem)] leading-[0.9]">Trade {room.id}</h1>
                <StatusLine room={room} now={now} expired={expired} />
              </div>
              {room.openMarket && (
                <p className="text-shadow-scene max-w-[40rem] text-[15px] font-medium text-alert">
                  Open market: this room takes any registered token or NFT, and nobody has checked them. Compare every full path with what you agreed.
                </p>
              )}
            </div>
            {!practice && realms.rooms && (
              <a className={sceneControl} href={gnowebUrl(realms.rooms, `room/${room.id}`)} target="_blank" rel="noreferrer">
                View on gno.land
                <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5.5 10.5 10.5 5.5M6.5 5.5h4v4" />
                </svg>
              </a>
            )}
          </div>
        </div>

        <TradeStage
          state={stageState}
          plates={plates}
          label={stageLabel}
          overlap={{ top: headHeight + 8, bottom: OVERLAP }}
          onUnavailable={() => setSceneless(true)}
          className="scene-band -mt-5 h-[clamp(232px,64vw,320px)] sm:h-[clamp(320px,46vw,440px)] lg:mt-0 lg:h-[clamp(440px,calc(100svh-340px),660px)]"
        />
      </div>

      {body}

      {role === left && (
        <WalletDialog
          open={walletOpen && canEdit}
          side={left}
          items={inventory.data}
          loading={inventory.loading}
          error={inventory.error}
          tokens={tokens}
          practice={practice}
          staged={staged}
          reserveFor={(item) => (!practice && item.kind === "coin" && item.denom === "ugnot" ? FEE_RESERVE : 0n)}
          full={isFull}
          refuse={refuse}
          onAdd={(o) => {
            stage(o);
            setTakeBack(null);
          }}
          onClose={() => setWalletOpen(false)}
        />
      )}

      {role === "maker" && (
        <WalletDialog
          open={asking && live}
          side="taker"
          mode="ask"
          items={them ? theirs.data : catalogue}
          loading={them ? theirs.loading : false}
          error={them ? theirs.error : null}
          tokens={tokens}
          practice={practice}
          staged={price}
          reserveFor={() => 0n}
          full={priceFull}
          refuse={refuse}
          onAdd={ask}
          onClose={() => setAsking(false)}
        />
      )}

      {dock && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">{dock}</div>
      )}

      {seat && other && confirm && (
        <ConfirmDialog
          open={confirm === "fill" ? canFill && !fillBlocked : confirm === "price" ? canPrice && price.length > 0 : canReady}
          mode={confirm}
          roomId={room.id}
          version={room.version}
          side={seat}
          give={confirm === "fill" ? room.want : room[seat].assets}
          get={confirm === "price" ? asAssets(price) : room[other].assets}
          changed={new Set(Object.keys(marks.deltas))}
          tokens={tokens}
          verified={verified}
          openMarket={room.openMarket}
          feeBps={room.feeBps}
          practice={practice}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setNotice(null);
            if (confirm === "fill") {
              await run("Accepting their price", () => venue.fill(room.id, room.version));
            } else if (confirm === "price") {
              const want = price;
              const ok = await run("Putting up your price", () => venue.offer(room.id, room.version, want), "Your price is up");
              if (ok) setPrice([]);
            } else {
              await run(theyReady ? "The trade" : "Getting ready", () => venue.lock(room.id, room.version), theyReady ? undefined : `Ready on version ${room.version}`);
            }
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function StatusLine({ room, now, expired }: { room: Room; now: number; expired: boolean }) {
  let text: string;
  if (room.status === "settled") text = `Traded ${when(room.closedAt)}`;
  else if (room.status === "cancelled") text = `Cancelled ${when(room.closedAt)}`;
  else if (expired) text = `Expired ${ago(room.expiresAt, now)}`;
  else text = `Closes in ${duration(room.expiresAt - now)}`;
  return (
    <p className={cx("text-shadow-scene text-[15px]", expired ? "text-alert" : "text-muted")} title={room.status === "open" ? `Until ${when(room.expiresAt)}` : undefined}>
      {text}
    </p>
  );
}
