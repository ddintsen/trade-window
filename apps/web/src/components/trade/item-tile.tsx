"use client";

import { GLASS } from "@/components/brand/mark";
import { cx } from "@/lib/cx";
import { useItemIcon, type IconLook } from "./use-item-icon";

/**
 * The flat stand-in for an item: a block in the colour of the side that
 * owns it, its symbol on the lit core. Shown until the rendered icon is
 * ready, and wherever WebGL is missing.
 */
export function ItemGlyph({ side, symbol, logo, size = "md", dim = false }: { side: "maker" | "taker"; symbol: string; logo?: string | null; size?: "sm" | "md" | "lg"; dim?: boolean }) {
  const g = GLASS[side];
  if (logo) {
    return (
      <span aria-hidden className={cx("relative flex aspect-square w-full items-center justify-center notch well transition-[filter,opacity] duration-300", dim && "opacity-40 grayscale")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a token logo from the app's own folder */}
        <img src={logo} alt="" className="h-[58%] w-[58%]" draggable={false} />
      </span>
    );
  }
  const short = symbol.length > 6 ? `${symbol.slice(0, 5)}…` : symbol;
  return (
    <span aria-hidden className={cx("relative flex aspect-square w-full items-center justify-center notch well transition-[filter,opacity] duration-300", dim && "opacity-40 grayscale")}>
      <span className="flex h-[62%] w-[62%] items-center justify-center rounded-[22%]" style={{ background: g.rim }}>
        <span
          className={cx(
            "flex h-[64%] w-[64%] items-center justify-center rounded-[18%] font-semibold tracking-[-0.01em] text-ground",
            size === "sm" ? "text-[9px]" : size === "lg" ? "text-xl" : "text-[11px]",
          )}
          style={{ background: g.core }}
        >
          {short}
        </span>
      </span>
    </span>
  );
}

/**
 * An item as a picture: the same glass coin or cube that sits on the table
 * in the scene, rendered on the colour of a slot.
 */
export function ItemIcon({ look, size = "md", dim = false, className }: { look: IconLook; size?: "sm" | "md" | "lg"; dim?: boolean; className?: string }) {
  const url = useItemIcon(look, size === "lg" ? 384 : size === "sm" ? 128 : 176);
  if (!url) {
    return (
      <span className={cx("block w-full", className)}>
        <ItemGlyph side={look.side} symbol={look.symbol} logo={look.logo} size={size} dim={dim} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        "block aspect-square w-full notch well bg-cover bg-center transition-[filter,opacity] duration-300",
        dim && "opacity-40 grayscale",
        className,
      )}
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}

export function EmptySlot({ highlight = false }: { highlight?: boolean }) {
  return <span aria-hidden className={cx("block aspect-square w-full notch well transition-colors duration-200", highlight && "bg-white/10")} />;
}
