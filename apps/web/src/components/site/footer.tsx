import Link from "next/link";
import { Mark } from "@/components/brand/mark";
import { gnowebUrl, network, realms, REPO_URL } from "@/lib/chain/config";

export function Footer() {
  return (
    <footer className="mt-24 bg-surface">
      <div className="shell grid gap-10 py-12 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Mark className="h-6 w-auto self-start" />
          <p className="max-w-xs text-sm text-muted">
            Two-party trade rooms on Gno.land. Nothing moves until both sides are ready on the same version.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-pixel text-[22px] text-frost">Product</p>
          <Link className="hover:text-ink" href="/trade">Rooms</Link>
          <Link className="hover:text-ink" href="/practice">Practice room</Link>
          <Link className="hover:text-ink" href="/board">Board</Link>
          <Link className="hover:text-ink" href="/request">Private request</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-pixel text-[22px] text-frost">On chain</p>
          <Link className="hover:text-ink" href="/how">How it works</Link>
          <Link className="hover:text-ink" href="/contract">Contract reference</Link>
          {realms.rooms && (
            <a className="hover:text-ink" href={gnowebUrl(realms.rooms)} target="_blank" rel="noreferrer">
              Rooms realm on gno.land
            </a>
          )}
          {realms.board && (
            <a className="hover:text-ink" href={gnowebUrl(realms.board)} target="_blank" rel="noreferrer">
              Board realm on gno.land
            </a>
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-pixel text-[22px] text-frost">Source</p>
          <a className="hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a className="hover:text-ink" href="https://gno.land" target="_blank" rel="noreferrer">Built on Gno.land</a>
          <p className="text-muted">{network.name}, chain id {network.chainId}</p>
        </div>
      </div>
    </footer>
  );
}
