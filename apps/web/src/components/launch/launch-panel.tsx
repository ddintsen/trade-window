"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy";
import { Field, Input } from "@/components/ui/field";
import { gnowebUrl, network, realms } from "@/lib/chain/config";
import { coinBalances } from "@/lib/chain/rpc";
import { cx } from "@/lib/cx";
import { formatUnits } from "@/lib/chain/assets";
import {
  DEPLOY,
  deployMessage,
  isLive,
  nameOf,
  nameProblem,
  realmPath,
  REALMS,
  registerNameMessage,
  roles,
  siteSettings,
  SUGGESTED_NAME,
} from "@/lib/launch";
import type { RealmName } from "@/lib/chain/realm-source";
import { sendMessages, WalletError } from "@/lib/wallet/adena";
import { useWallet, wallet } from "@/lib/wallet/store";

type RealmState = "checking" | "absent" | "sending" | "waiting" | "live";

const WAIT_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls until a realm answers, for up to ten minutes; false if it never did or the page went away. */
async function waitUntilLive(path: string, stillHere: () => boolean): Promise<boolean> {
  const until = Date.now() + WAIT_MS;
  while (stillHere() && Date.now() < until) {
    if (await isLive(path).catch(() => false)) return true;
    await sleep(5000);
  }
  return false;
}

function Step({ title, done, children }: { title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4 notch notch-lg slab bg-surface p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-pixel text-[2.1rem] leading-none">{title}</h2>
        {done && <p className="text-sm font-medium text-act">Done</p>}
      </div>
      {children}
    </section>
  );
}

const STATUS: Record<RealmState, string> = {
  checking: "Checking the network…",
  absent: "Not published yet.",
  sending: "Confirm in Adena…",
  waiting: `Published. ${network.name} keeps new code parked until its reviewer enables it, usually within a few blocks; this page waits.`,
  live: "Live.",
};

/**
 * Publishes the rooms and board realms from the connected wallet, under the
 * owner's name or address, and prints the site's settings afterwards.
 */
export function LaunchPanel() {
  const w = useWallet();
  const address = w.account?.address ?? "";
  const [balance, setBalance] = useState<bigint | null>(null);
  // The account's registered name, keyed by the address it was read for: undefined while unknown.
  const [named, setNamed] = useState<{ address: string; name: string | null } | null>(null);
  const name = named && named.address === address ? named.name : undefined;
  const setName = (n: string | null) => setNamed({ address, name: n });
  const [useAddress, setUseAddress] = useState(false);
  const [wanted, setWanted] = useState(SUGGESTED_NAME);
  const [registering, setRegistering] = useState(false);
  // Each realm's state, keyed by the namespace it was read for: "checking" until it has been.
  const [found, setFound] = useState<{ ns: string; state: Record<RealmName, RealmState> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState<{ admin: string; treasury: string } | null>(null);
  // False once the page has gone, so late answers are dropped. Set on every mount: React may mount twice.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const namespace = name && !useAddress ? name : useAddress ? address : "";
  const ready = w.status === "connected" && w.onAppNetwork;
  const state: Record<RealmName, RealmState> = found && found.ns === namespace ? found.state : { rooms: "checking", board: "checking" };
  const setState = (update: (s: Record<RealmName, RealmState>) => Record<RealmName, RealmState>) =>
    setFound((f) => ({ ns: namespace, state: update(f && f.ns === namespace ? f.state : state) }));

  // The account's name and balance.
  useEffect(() => {
    if (!ready || !address) return;
    let live = true;
    nameOf(address)
      .then((n) => live && setNamed({ address, name: n }))
      .catch(() => live && setNamed({ address, name: null }));
    coinBalances(address)
      .then((b) => live && setBalance(BigInt(b.ugnot ?? "0")))
      .catch(() => live && setBalance(null));
    return () => {
      live = false;
    };
  }, [ready, address]);

  // Whether each realm already answers under the chosen namespace.
  const check = useCallback(async (ns: string) => {
    const [rooms, board] = await Promise.all(REALMS.map((r) => isLive(realmPath(ns, r)).catch(() => false)));
    if (alive.current) setFound({ ns, state: { rooms: rooms ? "live" : "absent", board: board ? "live" : "absent" } });
  }, []);
  useEffect(() => {
    if (namespace) void check(namespace);
  }, [namespace, check]);

  // Once rooms is live, read who holds its roles.
  useEffect(() => {
    if (!namespace || state.rooms !== "live") return;
    roles(realmPath(namespace, "rooms"))
      .then((r) => alive.current && setOwner(r))
      .catch(() => alive.current && setOwner(null));
  }, [namespace, state.rooms]);

  const fail = (e: unknown) => setError(e instanceof WalletError || e instanceof Error ? e.message : String(e));

  async function register() {
    const problem = nameProblem(wanted);
    if (problem) return setError(problem);
    setError(null);
    setRegistering(true);
    try {
      await sendMessages([registerNameMessage(address, wanted)], "Register a namespace for Trade Window", 50_000_000);
      const n = await nameOf(address);
      if (alive.current) {
        setName(n);
        setUseAddress(false);
      }
    } catch (e) {
      fail(e);
    } finally {
      if (alive.current) setRegistering(false);
    }
  }

  async function publish(realm: RealmName) {
    setError(null);
    setState((s) => ({ ...s, [realm]: "sending" }));
    try {
      await sendMessages([deployMessage(address, namespace, realm)], `Publish Trade Window ${realm}`, DEPLOY[realm].gasWanted);
      setState((s) => ({ ...s, [realm]: "waiting" }));
      if (await waitUntilLive(realmPath(namespace, realm), () => alive.current)) {
        setState((s) => ({ ...s, [realm]: "live" }));
        return;
      }
      if (alive.current) setError(`The ${realm} realm is published but not enabled yet. Leave this page open or come back later: it checks again on load.`);
    } catch (e) {
      fail(e);
      const there = await isLive(realmPath(namespace, realm)).catch(() => false);
      if (alive.current) setState((s) => ({ ...s, [realm]: there ? "live" : "absent" }));
    }
  }

  const both = state.rooms === "live" && state.board === "live";

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p role="alert" className="notch bg-alert-bg p-4 text-[15px] text-alert">
          {error}
        </p>
      )}

      <Step title="Your wallet" done={ready}>
        {w.status !== "connected" ? (
          <>
            <p className="text-[15px] text-muted">Connect the Adena account that should own Trade Window on {network.name}.</p>
            <Button variant="primary" className="w-fit" busy={w.status === "connecting"} onClick={() => wallet.connect().catch(fail)}>
              Connect Adena
            </Button>
          </>
        ) : !w.onAppNetwork ? (
          <>
            <p className="text-[15px] text-muted">Adena is on another network.</p>
            <Button variant="primary" className="w-fit" onClick={() => wallet.switchNetwork().catch(fail)}>
              Switch Adena to {network.name}
            </Button>
          </>
        ) : (
          <div className="flex flex-col gap-1 text-[15px]">
            <p className="font-mono text-[14px] [overflow-wrap:anywhere]">{address}</p>
            <p className="text-muted">
              {balance === null ? "Balance unavailable." : `${formatUnits(balance, 6)} GNOT on ${network.name}.`} Publishing both realms locks about 8 GNOT of
              storage deposit and costs under 1 GNOT in network fees.
            </p>
          </div>
        )}
      </Step>

      {ready && (
        <Step title="Namespace" done={!!namespace}>
          {name === undefined ? (
            <p className="text-[15px] text-muted">Looking up your name…</p>
          ) : name ? (
            <p className="text-[15px]">
              The realms go under your name <span className="font-mono">{name}</span>: <span className="font-mono">{realmPath(name, "rooms")}</span>.
            </p>
          ) : (
            <>
              <p className="text-[15px] text-muted">
                The realms go under a name you register, or under your address. A name reads better in links and on gno.land; each address
                holds one.
              </p>
              {!useAddress && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Field label="Name to register" hint="nym-, 5 to 13 lowercase letters, 3 digits" className="sm:w-80">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={wanted} onChange={(e) => setWanted(e.target.value.trim())} spellCheck={false} />}
                  </Field>
                  <Button variant="primary" busy={registering} busyLabel="Confirm in Adena…" onClick={register}>
                    Register name
                  </Button>
                </div>
              )}
              <Button variant="quiet" className="w-fit" onClick={() => setUseAddress((v) => !v)}>
                {useAddress ? "Register a name instead" : "Use my address instead"}
              </Button>
              {useAddress && (
                <p className="text-[15px]">
                  The realms go under <span className="font-mono [overflow-wrap:anywhere]">{realmPath(address, "rooms")}</span>.
                </p>
              )}
            </>
          )}
        </Step>
      )}

      {ready &&
        namespace &&
        REALMS.map((r) => (
          <Step key={r} title={r === "rooms" ? "Rooms realm" : "Board realm"} done={state[r] === "live"}>
            <p className="font-mono text-[14px] [overflow-wrap:anywhere]">{realmPath(namespace, r)}</p>
            <p aria-live="polite" className={cx("text-[15px]", state[r] === "live" ? "text-ink" : "text-muted")}>
              {STATUS[state[r]]}
              {state[r] === "live" && (
                <>
                  {" "}
                  <a className="underline underline-offset-4" href={gnowebUrl(realmPath(namespace, r))} target="_blank" rel="noreferrer">
                    Open on gno.land
                  </a>
                </>
              )}
            </p>
            {state[r] === "absent" && (
              <Button variant="primary" className="w-fit" disabled={r === "board" && state.rooms !== "live"} onClick={() => publish(r)}>
                Publish {r}
              </Button>
            )}
            {r === "board" && state.rooms !== "live" && state.board === "absent" && <p className="text-[13px] text-muted">Publish rooms first.</p>}
          </Step>
        ))}

      {ready && namespace && state.rooms === "live" && (
        <Step title="Roles and site settings" done={both && owner?.admin === address && owner?.treasury === address}>
          {owner ? (
            <ul className="flex flex-col gap-1 text-[15px]">
              <li>
                Admin: <span className="font-mono">{owner.admin === address ? "you" : owner.admin || "nobody"}</span>
              </li>
              <li>
                Treasury: <span className="font-mono">{owner.treasury === address ? "you" : owner.treasury || "nobody"}</span>
              </li>
            </ul>
          ) : (
            <p className="text-[15px] text-muted">Reading the roles…</p>
          )}
          {both ? (
            <>
              <p className="text-[15px] text-muted">Give the site these settings (Vercel, Production and Preview), then deploy it again.</p>
              <pre className="code overflow-x-auto notch well p-4 text-[13px] leading-relaxed">{siteSettings(namespace)}</pre>
              <CopyButton text={siteSettings(namespace)} label="Copy settings" className="w-fit" />
            </>
          ) : (
            <p className="text-[15px] text-muted">The settings appear once both realms are live.</p>
          )}
          {realms.rooms && realms.rooms !== realmPath(namespace, "rooms") && (
            <p className="text-[13px] text-muted">This site currently uses {realms.rooms}.</p>
          )}
        </Step>
      )}
    </div>
  );
}
