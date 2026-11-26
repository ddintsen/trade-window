"use client";

import { usePathname } from "next/navigation";

/**
 * The night forest behind every page that has no scene of its own: a still
 * rendered from the same voxel world as the trade window (no bridge, no
 * traders), darkened toward the bottom so text stays easy to read. The home
 * page and the trade rooms draw their own scenes, so they go without it.
 */
export function Backdrop() {
  const path = usePathname() ?? "/";
  if (path === "/" || /^\/(trade|practice)\/\d+/.test(path)) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-[url(/scenes/forest-night.webp)] bg-cover bg-[center_30%]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(11_14_13/0.42)_0%,rgb(11_14_13/0.74)_42%,rgb(11_14_13/0.9)_100%)]" />
    </div>
  );
}
