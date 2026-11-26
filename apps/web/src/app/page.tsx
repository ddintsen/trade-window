import Link from "next/link";
import { HeroScene } from "@/components/home/hero-scene";
import { HomeLive } from "@/components/home/home-live";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { gnowebSourceUrl, realms, roomsDeployed } from "@/lib/chain/config";
import { LOCK_SOURCE } from "@/lib/snippets";

const RULES: { term: string; text: string }[] = [
  { term: "Two seats", text: "The maker opens the room. The taker is either invited by address or takes the open seat from a shared link." },
  { term: "Deposits", text: "GNOT, GRC20 tokens and NFTs, up to eight per side. The realm holds them, not a person. Ordinary rooms take only verified assets." },
  { term: "Version", text: "Every change to the room, a deposit, a take-back, a join or a named price, raises its version by one." },
  { term: "Ready", text: "Getting ready names one version. When the room changes, earlier ready marks stop applying." },
  { term: "The swap", text: "The second ready mark on the same version sends each side's deposits to the other, less a 0.5% fee on coins and tokens, in that same transaction." },
  { term: "Walking away", text: "Before the swap either side can withdraw or cancel. After expiry anyone can cancel, and every deposit still goes home." },
];

function GnoCode({ source }: { source: string }) {
  // Comments in muted ink; everything else plain. Enough to read, nothing to decorate.
  return (
    <>
      {source.split("\n").map((line, i) => (
        <span key={i} className={line.trimStart().startsWith("//") ? "text-muted" : undefined}>
          {line}
          {"\n"}
        </span>
      ))}
    </>
  );
}

export default function Home() {
  return (
    <>
      <section className="shell grid items-center gap-8 pb-10 pt-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:py-10">
        <div className="relative z-10 flex flex-col items-start gap-6 lg:pb-16">
          <h1 className="font-pixel max-w-[11ch] text-[clamp(3.8rem,2rem+6.4vw,8rem)] leading-[0.86]">
            Nothing crosses until you are both ready
          </h1>
          <p className="max-w-[34rem] text-[clamp(1.0625rem,1rem+0.3vw,1.25rem)] text-muted">
            A trade room for two on Gno.land. Put in GNOT, tokens or NFTs, both get ready on the same version, and the second ready
            mark swaps everything in one transaction.
          </p>
          <div className="flex flex-wrap gap-3">
            {roomsDeployed ? (
              <>
                <LinkButton href="/trade" variant="primary">
                  Open a room
                </LinkButton>
                <LinkButton href="/practice" variant="secondary">
                  Practice first
                </LinkButton>
              </>
            ) : (
              <>
                <LinkButton href="/practice" variant="primary">
                  Try a practice room
                </LinkButton>
                <LinkButton href="/how" variant="secondary">
                  How it works
                </LinkButton>
              </>
            )}
          </div>
        </div>
        <HeroScene className="-mx-4 h-[22rem] sm:mx-0 sm:h-[30rem] lg:-mr-[clamp(16px,4vw,48px)] lg:h-[min(46rem,calc(100dvh-7rem))]" />
      </section>

      <section aria-labelledby="rules" className="bg-surface">
        <div className="shell grid gap-10 py-16 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16 lg:py-24">
          <div className="flex flex-col items-start gap-4">
            <h2 id="rules" className="font-pixel text-[clamp(3rem,2.2rem+2.8vw,4.8rem)]">
              Every rule, on one screen
            </h2>
            <Link href="/how" className={buttonClass("secondary", "md")}>
              See them step by step
            </Link>
          </div>
          <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {RULES.map((r) => (
              <div key={r.term} className="flex flex-col gap-1.5">
                <dt className="font-pixel text-[1.85rem] text-frost">{r.term}</dt>
                <dd className="text-[16px] text-muted">{r.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="shell py-16 lg:py-24">
        <HomeLive />
      </section>

      <section aria-labelledby="code" className="shell pb-8">
        <div className="notch notch-lg slab grid gap-8 bg-[#080a09] p-6 sm:p-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-14 lg:p-14">
          <div className="flex flex-col items-start gap-4">
            <h2 id="code" className="font-pixel text-[clamp(3rem,2.2rem+2.8vw,4.8rem)]">
              The swap is one function
            </h2>
            <p className="text-[17px] text-muted">
              This is Lock, word for word from the realm. When the other side already locked the same version, it calls settle, which
              sends every deposit across.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/contract" className={buttonClass("secondary", "md")}>
                Read the contract reference
              </Link>
              {realms.rooms && (
                <a href={gnowebSourceUrl(realms.rooms, "rooms.gno")} target="_blank" rel="noreferrer" className={buttonClass("quiet", "md")}>
                  See the source on gno.land
                </a>
              )}
            </div>
          </div>
          <pre className="code min-w-0 overflow-x-auto text-[12.5px] leading-[1.7] text-ink sm:text-[13px]" tabIndex={0} aria-label="Source of the Lock function">
            <code>
              <GnoCode source={LOCK_SOURCE} />
            </code>
          </pre>
        </div>
      </section>
    </>
  );
}
