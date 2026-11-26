"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { WalletButton } from "@/components/wallet/wallet-button";
import { boardDeployed, network, roomsDeployed } from "@/lib/chain/config";
import { cx } from "@/lib/cx";

// Until a realm is live there is nothing to sign, so the wallet and the
// network it would sign on stay out of the way.
const onChain = roomsDeployed || boardDeployed;

const NAV = [
  { href: "/trade", label: "Rooms", match: ["/trade", "/practice"] },
  { href: "/board", label: "Board", match: ["/board"] },
  { href: "/how", label: "How it works", match: ["/how", "/contract"] },
];

function NavLinks({ onNavigate, stacked = false }: { onNavigate?: () => void; stacked?: boolean }) {
  const path = usePathname() ?? "/";
  return (
    <>
      {NAV.map((item) => {
        const active = item.match.some((m) => path === m || path.startsWith(`${m}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative notch transition-colors duration-150",
              "font-pixel",
              stacked ? "py-3 text-[30px]" : "px-1 py-2 text-[23px]",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {item.label}
            {active && !stacked && <span aria-hidden className="absolute inset-x-1 -bottom-0.5 h-[3px] bg-act" />}
          </Link>
        );
      })}
    </>
  );
}

export function Header() {
  const path = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === path;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof next === "function" ? next(open) : next) ? path : null);

  return (
    <header className="sticky top-0 z-30 bg-ground/92 backdrop-blur-md">
      <div className="shell grid h-16 grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          <NavLinks />
        </nav>
        <div className="justify-self-start lg:justify-self-center">
          <Wordmark />
        </div>
        <div className="hidden items-center justify-end gap-4 lg:flex">
          {onChain && (
            <>
              <span className="text-sm text-muted" title={`Chain id ${network.chainId}`}>
                {network.name}
              </span>
              <WalletButton />
            </>
          )}
        </div>
        <button
          type="button"
          className="font-pixel notch key justify-self-end bg-control px-4 pb-[5px] pt-1.5 text-[21px] text-ink lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="shell flex flex-col gap-2 pb-6 lg:hidden">
          <nav aria-label="Main" className="flex flex-col">
            <NavLinks stacked onNavigate={() => setOpen(false)} />
          </nav>
          {onChain && (
            <>
              <p className="pt-2 text-sm text-muted">{network.name}</p>
              <WalletButton block />
            </>
          )}
        </div>
      )}
    </header>
  );
}
