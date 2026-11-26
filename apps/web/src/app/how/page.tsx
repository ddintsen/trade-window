import type { Metadata } from "next";
import Link from "next/link";
import { PaneDiagram, type DiagramState } from "@/components/brand/pane-diagram";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description: "Both sides put their items in, both get ready on the same version of the room, and the second ready mark swaps everything in one transaction.",
};

const M = "maker" as const;
const T = "taker" as const;

const STEPS: { title: string; body: string; state: DiagramState }[] = [
  {
    title: "Open a room",
    body: "The maker opens a room and either invites one address or leaves the seat open for whoever has the link. A room can settle for between 10 minutes and 7 days; the maker picks how long.",
    state: { maker: [], taker: [], version: 1, seatOpen: true, label: "An empty room at version 1 with an open seat" },
  },
  {
    title: "Both sides deposit",
    body: "Each side puts in what it gives: GNOT, tokens from the GRC20 registry or NFTs from registered collections, up to eight per side. Ordinary rooms take only verified assets; an open-market room takes any registered one. Deposits sit in the realm, not with either person. Every deposit, take-back or join raises the version by one.",
    state: { maker: [M, M, M], taker: [T, T], version: 6, label: "Version 6: three maker deposits and two taker deposits, nobody ready" },
  },
  {
    title: "Get ready on the version you checked",
    body: "Getting ready names one version. Here the maker reviewed version 6 and got ready on it. If the taker adds or takes anything, the room becomes version 7 and the maker's ready mark stops applying, so nothing can settle on terms the maker did not see.",
    state: { maker: [M, M, M], taker: [T, T], version: 6, makerLit: true, label: "Version 6 with the maker's lamp lit" },
  },
  {
    title: "The second ready mark swaps",
    body: "When the taker gets ready on version 6 too, the realm sends each side's deposits to the other in that same transaction, less a 0.5% fee on coins and tokens. There is no third step and nobody in between.",
    state: { maker: [T, T], taker: [M, M, M], version: 6, makerLit: true, takerLit: true, label: "Both lamps lit on version 6; the cubes have crossed sides" },
  },
  {
    title: "Or walk away",
    body: "Until the swap, either side can take a deposit back or cancel the room, which returns every deposit to its owner. Once a room expires, anyone can cancel it, and the deposits still go only to their owners.",
    state: { maker: [M, M, M], taker: [T, T], version: 6, dim: true, label: "A cancelled room: every cube back with its owner" },
  },
];

const GUARANTEES = [
  "Only the two parties can deposit, take back, get ready or take a ready mark back.",
  "Deposits leave the realm only by the room's rules: back to their owner on withdrawal or cancellation, to the other side on settlement.",
  "The admin can pause new rooms, deposits and ready marks, set the fee for rooms opened later (at most 1%), and verify assets, each verification counting only a day later. It can never move a deposit. Taking back, clearing a ready mark and cancelling always work.",
  "If any transfer in a transaction fails, the whole transaction fails and nothing moves.",
  "Realm code on gno.land cannot be changed after it is deployed. What you read is what runs.",
];

export default function HowPage() {
  return (
    <div className="shell py-10 lg:py-14">
      <header className="flex max-w-3xl flex-col gap-4">
        <h1 className="font-pixel text-[clamp(3.4rem,2.4rem+3.6vw,6rem)]">
          Nothing moves until you are both ready on the same version
        </h1>
        <p className="max-w-2xl text-[19px] text-muted">
          A trade room is a small contract on Gno.land with two sides. It counts every change, and it swaps only what both people
          got ready on.
        </p>
      </header>

      <ol className="mt-14 flex flex-col gap-14 lg:mt-20 lg:gap-20">
        {STEPS.map((s) => (
          <li key={s.title} className="grid items-center gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
            <div className="flex max-w-xl flex-col gap-3">
              <h2 className="font-pixel text-[2.5rem]">{s.title}</h2>
              <p className="text-[17px] text-muted">{s.body}</p>
            </div>
            <PaneDiagram state={s.state} className="w-full max-w-[34rem]" />
          </li>
        ))}
      </ol>

      <section aria-labelledby="guarantees" className="mt-20 grid gap-8 notch notch-lg slab bg-surface p-6 sm:p-10 lg:mt-28 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-3">
          <h2 id="guarantees" className="font-pixel text-[2.5rem]">
            What the realm holds to
          </h2>
          <p className="text-[15px] text-muted">
            These rules are in the code and covered by its tests. The{" "}
            <Link href="/contract" className="text-ink underline underline-offset-4">
              contract reference
            </Link>{" "}
            lists every function and error.
          </p>
        </div>
        <ul className="flex flex-col gap-4 text-[17px]">
          {GUARANTEES.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="costs" className="mt-16 grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <h2 id="costs" className="font-pixel text-[2.5rem]">
          What it costs
        </h2>
        <div className="flex max-w-2xl flex-col gap-3 text-[17px] text-muted">
          <p>
            Trade Window takes no cut. Every action is a gno.land transaction with a network fee, and actions that store something new,
            like opening a room or adding an asset, also lock a small storage deposit, as on every realm.
          </p>
          <p>Practice rooms cost nothing at all: they run in your browser and never touch a chain.</p>
        </div>
      </section>

      <div className="mt-16 flex flex-wrap gap-3">
        <LinkButton href="/practice" variant="primary">
          Try it in a practice room
        </LinkButton>
        <LinkButton href="/trade" variant="secondary">
          Open a room
        </LinkButton>
      </div>
    </div>
  );
}
