import { GLASS } from "@/components/brand/mark";

/**
 * A room drawn in the mark's vocabulary: the maker's pane on the left, the
 * taker's on the right, the version and both lamps on the seam. Each cube
 * keeps the colour of the side that deposited it, so a swap shows as cubes
 * that crossed.
 */
export interface DiagramState {
  /** Cubes in the maker's pane, by the colour of the side that put them in. */
  maker: ("maker" | "taker")[];
  taker: ("maker" | "taker")[];
  makerLit?: boolean;
  takerLit?: boolean;
  version: number;
  seatOpen?: boolean;
  dim?: boolean;
  label: string;
}

const PANE_W = 150;
const PANE_H = 112;
const SEAM = 72;
const UNIT = 34;
const GAP = 7;

function cube(x: number, y: number, side: "maker" | "taker", key: string) {
  const g = GLASS[side];
  const s = UNIT;
  return (
    <g key={key}>
      <rect x={x} y={y} width={s} height={s} rx={6} fill={g.rim} />
      <rect x={x + 7.5} y={y + 7.5} width={s - 15} height={s - 15} rx={3.5} fill={g.core} />
    </g>
  );
}

function cubes(list: ("maker" | "taker")[], ox: number, oy: number, prefix: string) {
  // Up to six cubes, three per row, centred in the pane.
  const cols = 3;
  const rows = Math.max(1, Math.ceil(list.length / cols));
  const gridW = cols * UNIT + (cols - 1) * GAP;
  const gridH = rows * UNIT + (rows - 1) * GAP;
  const x0 = ox + (PANE_W - gridW) / 2;
  const y0 = oy + (PANE_H - gridH) / 2;
  return list.slice(0, 6).map((side, i) => cube(x0 + (i % cols) * (UNIT + GAP), y0 + Math.floor(i / cols) * (UNIT + GAP), side, `${prefix}${i}`));
}

function lamp(x: number, y: number, side: "maker" | "taker", lit: boolean) {
  const g = GLASS[side];
  return (
    <g>
      {lit && <rect x={x - 4} y={y - 4} width={26} height={26} rx={7} fill={g.core} opacity={0.2} />}
      <rect x={x} y={y} width={18} height={18} rx={4} fill={lit ? g.rim : "#242c29"} />
      <rect x={x + 4.5} y={y + 4.5} width={9} height={9} rx={2} fill={lit ? g.core : "#1a201e"} />
    </g>
  );
}

/** A pane with stepped pixel corners, the shape of the window's own slabs. */
function stepped(x: number, y: number, w: number, h: number, n = 5): string {
  const r = x + w, b = y + h, m = n * 2;
  return [
    `M${x + m} ${y}H${r - m}V${y + n}H${r - n}V${y + m}H${r}`,
    `V${b - m}H${r - n}V${b - n}H${r - m}V${b}`,
    `H${x + m}V${b - n}H${x + n}V${b - m}H${x}`,
    `V${y + m}H${x + n}V${y + n}H${x + m}Z`,
  ].join("");
}

export function PaneDiagram({ state, className }: { state: DiagramState; className?: string }) {
  const W = PANE_W * 2 + SEAM;
  const H = PANE_H;
  const tx = PANE_W + SEAM;
  const cx = PANE_W + SEAM / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={state.label} className={className} style={{ opacity: state.dim ? 0.55 : 1 }}>
      <path d={stepped(0, 0, PANE_W, PANE_H)} fill="#22190e" />
      <path d={stepped(tx, 0, PANE_W, PANE_H)} fill={state.seatOpen ? "#121715" : "#0e1e20"} />
      {cubes(state.maker, 0, 0, "m")}
      {cubes(state.taker, tx, 0, "t")}
      <text x={cx} y={30} textAnchor="middle" fill="#9aa6a1" fontSize={15} fontFamily="var(--font-handjet), sans-serif">
        version
      </text>
      <text
        x={cx}
        y={62}
        textAnchor="middle"
        fill="#e8eeeb"
        fontSize={36}
        fontWeight={640}
        fontFamily="var(--font-handjet), sans-serif"
        style={{ fontVariationSettings: '"ELSH" 2, "ELGR" 1' }}
      >
        {state.version}
      </text>
      {lamp(cx - 22, 78, "maker", !!state.makerLit)}
      {lamp(cx + 4, 78, "taker", !!state.takerLit)}
    </svg>
  );
}
