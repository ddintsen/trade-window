// The mark: two 2x3 panes of glass cubes with one cube swapped between
// them. Construction is shared with the favicon and the home scene.

type Cell = readonly [col: number, row: number];

export const MARK_COLS = 5;
export const MARK_ROWS = 3;

/** Left pane is the maker's (amber), right pane the taker's (aqua). */
export const MAKER_CELLS: readonly Cell[] = [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2], [3, 2]];
export const TAKER_CELLS: readonly Cell[] = [[3, 0], [4, 0], [3, 1], [4, 1], [4, 2], [1, 0]];

export const GLASS = {
  maker: { rim: "#9A5E1C", core: "#F2B35C" },
  taker: { rim: "#1E7880", core: "#74D3DA" },
} as const;

const UNIT = 10;
const GAP = 1.2;

function cubes(cells: readonly Cell[], glass: { rim: string; core: string }, ox = 0, oy = 0): string {
  return cells
    .map(([c, r]) => {
      const x = ox + c * UNIT + GAP / 2;
      const y = oy + r * UNIT + GAP / 2;
      const s = UNIT - GAP;
      return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.7" fill="${glass.rim}"/><rect x="${x + 2.1}" y="${y + 2.1}" width="${s - 4.2}" height="${s - 4.2}" rx="1" fill="${glass.core}"/>`;
    })
    .join("");
}

export function Mark({ className = "h-5 w-auto", title = "Trade Window" }: { className?: string; title?: string | null }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${MARK_COLS * UNIT} ${MARK_ROWS * UNIT}`}
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: cubes(MAKER_CELLS, GLASS.maker) + cubes(TAKER_CELLS, GLASS.taker) }}
    />
  );
}

/** Standalone SVG markup, for the favicon and social images. */
export function markSvg(background = "#0B0E0D", pad = 8): string {
  const w = MARK_COLS * UNIT + pad * 2;
  const h = MARK_ROWS * UNIT + pad * 2;
  const size = Math.max(w, h);
  const ox = (size - MARK_COLS * UNIT) / 2;
  const oy = (size - MARK_ROWS * UNIT) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="12" fill="${background}"/>${cubes(MAKER_CELLS, GLASS.maker, ox, oy)}${cubes(TAKER_CELLS, GLASS.taker, ox, oy)}</svg>`;
}
