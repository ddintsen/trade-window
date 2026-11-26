"use client";

import { useEffect, useState } from "react";
import type { ItemShape, Tier } from "@/components/three/item-mesh";

export interface IconLook {
  shape: ItemShape;
  symbol: string;
  side: "maker" | "taker";
  logo: string | null;
  tier: Tier;
  /** An NFT's number. */
  badge: string;
}

let webgl: boolean | null = null;
function canDraw(): boolean {
  if (webgl === null) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/**
 * A rendered picture of an item, or null while it renders and wherever
 * WebGL is missing (the flat glyph stands in).
 */
export function useItemIcon(look: IconLook | null, size: number): string | null {
  const key = look ? JSON.stringify([look.shape, look.symbol, look.logo ?? "", look.tier, look.badge, size]) : "";
  const [state, setState] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!key || !canDraw()) return;
    const [shape, symbol, logo, tier, badge] = JSON.parse(key) as [ItemShape, string, string, Tier, string, number];
    let alive = true;
    import("@/components/three/icons")
      .then(({ itemIcon }) => itemIcon({ shape, symbol, logo: logo || null, tier, badge, size }))
      .then((url) => {
        if (alive) setState({ key, url });
      })
      .catch(() => {
        // the flat glyph stays
      });
    return () => {
      alive = false;
    };
  }, [key, size]);

  return state && state.key === key ? state.url : null;
}
