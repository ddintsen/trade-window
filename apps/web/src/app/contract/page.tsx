import { buttonClass } from "@/components/ui/button";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { gnowebSourceUrl, gnowebUrl, network, realms, REPO_URL } from "@/lib/chain/config";

export const metadata: Metadata = {
  title: "Contract reference",
  description: "Every function, rule and error of the Trade Window realms on Gno.land.",
};

const SOURCE = `${REPO_URL}/tree/main/gno/realms/tradewindow`;

const CALLS: { sig: string; who: string; does: string }[] = [
  { sig: "Open(counterparty string, ttlMinutes int) uint64", who: "Anyone", does: "Opens a room at version 1. An empty counterparty leaves the seat open. ttlMinutes is 10 to 10080; 0 means 24 hours. Returns the room id." },
  { sig: "Join(roomID uint64)", who: "Anyone but the maker", does: "Takes the open seat. Raises the version." },
  { sig: "DepositCoins(roomID uint64)", who: "A party, signing directly", does: "Adds the coins sent with the call to your side. Raises the version." },
  { sig: "DepositToken(roomID uint64, tokenKey string, amount int64)", who: "A party", does: "Moves a GRC20 token from your account to the realm. Approve the realm address for the amount first, in the same transaction or before. Raises the version." },
  { sig: "WithdrawCoins(roomID uint64, denom string, amount int64)", who: "A party", does: "Takes coins back from your side, also after expiry. Raises the version." },
  { sig: "WithdrawToken(roomID uint64, tokenKey string, amount int64)", who: "A party", does: "Takes tokens back from your side, also after expiry. Raises the version." },
  { sig: "Lock(roomID uint64, version uint64) string", who: "A party", does: "Locks the named version, which must be the current one. If the other side already locked it, settles and returns \"settled\"; otherwise returns \"locked\"." },
  { sig: "Unlock(roomID uint64)", who: "A party", does: "Withdraws your lock on the current version." },
  { sig: "Cancel(roomID uint64)", who: "A party; anyone after expiry", does: "Closes the room and sends every deposit back to its owner." },
];

const READS: { sig: string; does: string }[] = [
  { sig: "RoomJSON(id uint64) string", does: "One room, or null." },
  { sig: "RoomsOfJSON(addr string, offset, limit int) string", does: "Rooms where addr is maker or taker, newest first, at most 50 per page." },
  { sig: "LatestJSON(offset, limit int) string", does: "All rooms, newest first." },
  { sig: "StatsJSON() string", does: "Rooms opened, settled and cancelled, settled volume per asset, pause state, realm address." },
  { sig: "TokensJSON(offset, limit int) string", does: "Tokens in the GRC20 registry with name, symbol and decimals." },
  { sig: "TokenJSON(key, owner string) string", does: "One token, with owner's balance and allowance to the realm." },
  { sig: "Address() string", does: "The realm address: it holds deposits and is the spender to approve." },
  { sig: "Render(path string) string", does: "The gno.land page: latest rooms, or room/<id>." },
];

const ERRORS: { text: string; when: string }[] = [
  { text: "the room changed: review version N and lock again", when: "Lock named a version that is no longer current." },
  { text: "both sides need at least one asset", when: "Lock on a room where a side is empty." },
  { text: "waiting for a counterparty to join", when: "Lock before anyone took the open seat." },
  { text: "this room has expired: withdraw or cancel to get deposits back", when: "Join, deposit or lock after the room's lifetime." },
  { text: "only the two parties of this room can do that", when: "A deposit, withdrawal, lock or unlock from a third account." },
  { text: "only the two parties can cancel a room before it expires", when: "Cancel from a third account before expiry." },
  { text: "this room is invite only", when: "Join on a room opened for one address." },
  { text: "the seat is already taken", when: "Join after someone else joined." },
  { text: "a side can hold at most 8 different assets", when: "A ninth asset on one side." },
  { text: "token is not in the GRC20 registry", when: "DepositToken with an unknown token key." },
  { text: "this call does not take coins: use DepositCoins", when: "Coins sent with any other call." },
  { text: "send coins with a direct call from your account", when: "DepositCoins from code instead of a signed call." },
  { text: "trade rooms are paused: you can still withdraw, unlock and cancel", when: "Open, join, deposit or lock while paused." },
];

const BOARD: { sig: string; does: string }[] = [
  { sig: "Post(side, give, want, note string, days int) uint64", does: "Publishes a listing. side is buy, sell or swap; give and want up to 80 characters, note up to 280; days 1 to 30, 0 means 7. At most 10 open listings per account." },
  { sig: "Close(id uint64)", does: "Takes your listing down." },
  { sig: "OpenJSON(side string, offset, limit int) string", does: "Open listings, newest first, optionally one side." },
  { sig: "ListingsOfJSON(owner string, offset, limit int) string", does: "Every listing of one owner." },
  { sig: "ListingJSON(id uint64) string", does: "One listing, or null." },
];

function Code({ children }: { children: ReactNode }) {
  return <code className="code text-[13px] leading-relaxed text-ink">{children}</code>;
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-14">
      <div className="flex flex-col gap-2">
        <h2 id={id} className="font-pixel text-[2.5rem]">
          {title}
        </h2>
        {intro && <div className="text-[15px] text-muted">{intro}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function ContractPage() {
  const roomsPath = realms.rooms || "gno.land/r/tradewindow/rooms";
  const example = `gnokey maketx call \\
  -pkgpath ${roomsPath} \\
  -func Lock -args 12 -args 7 \\
  -gas-fee 1000000ugnot -gas-wanted 20000000 \\
  -chainid ${network.chainId} -remote ${network.rpcUrl} \\
  -broadcast mykey`;

  return (
    <div className="shell flex flex-col gap-16 py-10 lg:gap-20 lg:py-14">
      <header className="flex max-w-3xl flex-col gap-4">
        <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Contract reference</h1>
        <p className="text-[17px] text-muted">
          Two realms written in Gno. The rooms realm holds deposits and settles trades; the board realm only stores public listings.
          Amounts are in base units: 1 GNOT is 1,000,000 ugnot.
        </p>
      </header>

      <Section id="where" title="Where they live">
        <dl className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {[
            { name: "Rooms", path: realms.rooms },
            { name: "Board", path: realms.board },
          ].map((r) => (
            <div key={r.name} className="flex flex-col gap-1 bg-surface px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <dt className="font-medium">{r.name}</dt>
              <dd className="flex min-w-0 flex-col gap-1 sm:items-end">
                {r.path ? (
                  <>
                    <Code>{r.path}</Code>
                    <span className="flex flex-wrap gap-2 pt-1">
                      <a className={buttonClass("quiet", "sm")} href={gnowebUrl(r.path)} target="_blank" rel="noreferrer">
                        Open on gno.land
                      </a>
                      <a className={buttonClass("quiet", "sm")} href={gnowebSourceUrl(r.path)} target="_blank" rel="noreferrer">
                        Source on chain
                      </a>
                    </span>
                  </>
                ) : (
                  <span className="text-[15px] text-muted">Not deployed on {network.name} yet</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[15px] text-muted">
          Source and tests:{" "}
          <a className="text-ink underline underline-offset-4" href={SOURCE} target="_blank" rel="noreferrer">
            gno/realms/tradewindow
          </a>{" "}
          on GitHub.
        </p>
      </Section>

      <Section
        id="calls"
        title="Rooms: calls"
        intro="Every call refuses coins except DepositCoins. Version rises with every change to what a side holds or who sits in it."
      >
        <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {CALLS.map((c) => (
            <li key={c.sig} className="flex flex-col gap-1.5 bg-surface px-5 py-4">
              <Code>{c.sig}</Code>
              <p className="text-[15px] text-muted">
                <span className="text-ink">{c.who}.</span> {c.does}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="reads" title="Rooms: reads" intro="Free queries through vm/qeval. JSON amounts are strings; times are unix seconds of block time.">
        <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {READS.map((c) => (
            <li key={c.sig} className="flex flex-col gap-1.5 bg-surface px-5 py-4">
              <Code>{c.sig}</Code>
              <p className="text-[15px] text-muted">{c.does}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="errors" title="Refusals" intro="A refused call changes nothing. These are the messages you can meet, word for word.">
        <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {ERRORS.map((e) => (
            <li key={e.text} className="grid gap-1.5 bg-surface px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-6">
              <Code>{e.text}</Code>
              <p className="text-[15px] text-muted">{e.when}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="board" title="Board" intro="Listings hold no assets and promise nothing. Text with control or invisible formatting characters is refused.">
        <ul className="flex flex-col gap-0.5 overflow-hidden notch notch-lg slab">
          {BOARD.map((c) => (
            <li key={c.sig} className="flex flex-col gap-1.5 bg-surface px-5 py-4">
              <Code>{c.sig}</Code>
              <p className="text-[15px] text-muted">{c.does}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="cli" title="From a terminal" intro="The same calls work without this site. Lock version 7 of room 12:">
        <pre className="code overflow-x-auto notch notch-lg slab bg-surface p-5 text-[13px] leading-relaxed text-ink">{example}</pre>
      </Section>
    </div>
  );
}
