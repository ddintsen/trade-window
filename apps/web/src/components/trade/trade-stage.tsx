"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/lib/cx";
import type { StageHandle, StageState } from "./stage";

export interface Plate {
  name: string;
  /** A word under the name, such as "Ready"; none most of the time. */
  note?: string;
  tone: "maker" | "taker" | "muted";
}

const nameTone = { maker: "text-maker", taker: "text-taker", muted: "text-frost" } as const;
const noteTone = { maker: "text-ink", taker: "text-ink", muted: "text-muted" } as const;

/**
 * The scene needs a graphics card. A software rasteriser (a virtual machine,
 * a blocked GPU, a headless test browser) would draw a frame a second and
 * stall the page, so there the window goes without it, as 67 does. A
 * reviewer can still ask for it with ?scene=on.
 */
function sceneAllowed(): boolean {
  try {
    let forced = new URLSearchParams(window.location.search).get("scene") === "on";
    try {
      const asked = localStorage.getItem("tw.scene");
      forced ||= asked === "on" || asked === "still";
    } catch {
      // storage off: no override
    }
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return forced || !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

/**
 * The trade as a scene: a band of forest across the page with the bridge,
 * the two traders and both offers on it. It shows the room as read; the
 * panels over its lower edge are where things are done. Without WebGL it
 * is left out and the page is told, so it can close the gap.
 */
export function TradeStage({
  state,
  plates,
  label,
  overlap,
  className,
  style,
  onUnavailable,
}: {
  state: StageState;
  plates: { left: Plate; right: Plate };
  /** The scene in words, for screen readers. */
  label: string;
  /** Pixels at the top and the bottom that the page's title and panels cover on wide screens. */
  overlap: { top: number; bottom: number };
  className?: string;
  style?: CSSProperties;
  onUnavailable?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const leftPlate = useRef<HTMLDivElement>(null);
  const rightPlate = useRef<HTMLDivElement>(null);
  const handle = useRef<StageHandle | null>(null);
  const latest = useRef<StageState>(state);
  const overlapRef = useRef(overlap);
  const overlapKey = `${overlap.top}:${overlap.bottom}`;
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(state);
  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    unavailable.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    const [top, bottom] = overlapKey.split(":").map(Number);
    overlapRef.current = { top, bottom };
    handle.current?.reframe();
  }, [overlapKey]);

  useEffect(() => {
    latest.current = JSON.parse(key) as StageState;
    handle.current?.update(latest.current);
  }, [key]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 1024px)");
    Promise.resolve()
      .then(() => {
        if (!sceneAllowed()) throw new Error("no hardware webgl");
        return import("./stage");
      })
      .then(({ mountStage }) => {
        if (cancelled) return;
        handle.current = mountStage(el, {
          reducedMotion,
          plates: { left: leftPlate.current, right: rightPlate.current },
          insets: () => (wide.matches ? overlapRef.current : { top: 0, bottom: 0 }),
          onFirstFrame: () => setDrawn(true),
        });
        handle.current.update(latest.current);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        unavailable.current?.();
      });
    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  if (failed) return null;

  return (
    <div className={cx("relative isolate overflow-hidden", className)} style={style}>
      <div role="img" aria-label={label} className="absolute inset-0" />
      <div
        ref={host}
        aria-hidden
        className={cx("absolute inset-0 transition-opacity duration-1000 ease-[var(--ease-out-soft)]", drawn ? "opacity-100" : "opacity-0")}
      />
      {(["left", "right"] as const).map((h) => {
        const p = plates[h];
        return (
          <div
            key={h}
            ref={h === "left" ? leftPlate : rightPlate}
            aria-hidden
            className="text-shadow-scene pointer-events-none invisible absolute left-0 top-0 flex flex-col items-center whitespace-nowrap pb-2 text-center"
          >
            <span className={cx("font-pixel text-[22px] sm:text-[28px]", nameTone[p.tone])}>{p.name}</span>
            {p.note && <span className={cx("mt-1 text-[12px] leading-tight sm:text-[13px]", noteTone[p.tone])}>{p.note}</span>}
          </div>
        );
      })}
    </div>
  );
}
