import { GLASS, MAKER_CELLS, TAKER_CELLS } from "./mark";

/**
 * The mark built from boxes, for generated images (next/og), with the same
 * proportions as the SVG: cell, gap, rim radius and glass core.
 */
export function MarkBoxes({ unit }: { unit: number }) {
  const gap = unit * 0.12;
  const s = unit - gap;
  const inset = unit * 0.21;
  const cells = [
    ...MAKER_CELLS.map((c) => ({ c, side: "maker" as const })),
    ...TAKER_CELLS.map((c) => ({ c, side: "taker" as const })),
  ];
  return (
    <div style={{ position: "relative", width: unit * 5, height: unit * 3, display: "flex" }}>
      {cells.map(({ c: [col, row], side }, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: col * unit + gap / 2,
            top: row * unit + gap / 2,
            width: s,
            height: s,
            borderRadius: unit * 0.17,
            background: GLASS[side].rim,
            display: "flex",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: inset,
              top: inset,
              width: s - inset * 2,
              height: s - inset * 2,
              borderRadius: unit * 0.1,
              background: GLASS[side].core,
            }}
          />
        </div>
      ))}
    </div>
  );
}
