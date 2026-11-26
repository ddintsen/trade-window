"use client";

import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/brand/mark";
import { cx } from "@/lib/cx";
import type { SceneHandle } from "./scene";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The night clearing with the two glass panes. Until three.js has drawn its
 * first frame, and wherever WebGL is missing, the mark stands in its place.
 */
export function HeroScene({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<SceneHandle | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || !webglAvailable()) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(reducedMotion);
    let cancelled = false;
    import("./scene")
      .then(({ mountScene }) => {
        if (cancelled) return;
        handle.current = mountScene(el, { reducedMotion, onFirstFrame: () => setDrawn(true) });
      })
      .catch(() => {
        // the mark stays in place
      });
    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, []);

  return (
    <div className={cx("relative isolate", className)}>
      <div
        role="img"
        aria-label="Two panes of glass blocks, amber and aqua, stand in a clearing at night. Each lights up in turn, then the two inner blocks cross to the other side."
        className="absolute inset-0"
      />
      <div
        className={cx(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-700 ease-[var(--ease-out-soft)]",
          drawn ? "opacity-0" : "opacity-100",
        )}
        aria-hidden
      >
        <Mark className="w-[46%] max-w-[22rem] drop-shadow-[0_0_60px_rgba(242,179,92,0.18)]" title={null} />
      </div>
      <div
        ref={box}
        aria-hidden
        className={cx(
          "scene-mask absolute inset-0 transition-opacity duration-1000 ease-[var(--ease-out-soft)]",
          drawn ? "opacity-100" : "opacity-0",
        )}
      />
      {drawn && !reduced && (
        <button
          type="button"
          onClick={() => {
            const next = !paused;
            setPaused(next);
            handle.current?.setPaused(next);
          }}
          className="font-pixel notch key absolute bottom-3 right-3 z-10 inline-flex h-9 items-center bg-control px-3 pb-[2px] text-[19px] text-frost hover:text-ink"
        >
          {paused ? "Play animation" : "Pause animation"}
        </button>
      )}
    </div>
  );
}
