// Writes the favicon from the mark's construction (src/components/brand/mark.tsx).
// Run: node scripts/brand.mjs
import fs from "node:fs";
import path from "node:path";

const UNIT = 10, GAP = 1.2;
const MAKER = [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2], [3, 2]];
const TAKER = [[3, 0], [4, 0], [3, 1], [4, 1], [4, 2], [1, 0]];
const GLASS = { maker: { rim: "#9A5E1C", core: "#F2B35C" }, taker: { rim: "#1E7880", core: "#74D3DA" } };

const cubes = (cells, g, ox, oy) => cells.map(([c, r]) => {
  const x = ox + c * UNIT + GAP / 2, y = oy + r * UNIT + GAP / 2, s = UNIT - GAP;
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.7" fill="${g.rim}"/><rect x="${x + 2.1}" y="${y + 2.1}" width="${s - 4.2}" height="${s - 4.2}" rx="1" fill="${g.core}"/>`;
}).join("");

const size = 62, ox = (size - 50) / 2, oy = (size - 30) / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="12" fill="#0B0E0D"/>${cubes(MAKER, GLASS.maker, ox, oy)}${cubes(TAKER, GLASS.taker, ox, oy)}</svg>\n`;
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../src/app/icon.svg");
fs.writeFileSync(out, svg);
console.log("wrote", out);

