// Renders the film's cards (reel/cards.html) frame by frame: the opening
// story (film time 0 to 10 s) and the closing lines (63.33 s to the end).
// The headline is set where the home page draws its own, so the cut into
// the site matches word for word; the check is printed.
//
//   node reel/cards.mjs <out-dir> <fonts-dir>
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "../apps/web/node_modules/playwright/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? "/tmp/tw-reel";
const fonts = process.argv[3] ?? `${out}/fonts`;
const FPS = 30;
/** The film's frame grid: frame i shows film time i / 30. */
export const HOOK = [0, 300]; // 0 to 10 s
export const OUTRO = [1900, Math.ceil(76.25 * FPS)]; // 63.33 s (the zoom into the cards) to the end

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(resolve(here, "cards.html")).href);
const data = (file, type) => `data:${type};base64,${readFileSync(file).toString("base64")}`;
await page.addStyleTag({
  content: `
  @font-face { font-family: "Handjet"; src: url(${data(`${fonts}/Handjet.ttf`, "font/ttf")}); font-weight: 100 900; }
  @font-face { font-family: "Instrument Sans"; src: url(${data(`${fonts}/InstrumentSans.ttf`, "font/ttf")}); font-weight: 400 700; }
  #forest { background-image: url(${data(resolve(here, "../apps/web/public/scenes/forest-night.webp"), "image/webp")}); }
  #s-coin { background-image: url(${data(resolve(here, "cards/coin.png"), "image/png")}); }
  #s-crate { background-image: url(${data(resolve(here, "cards/crate.png"), "image/png")}); }
  #s-lantern { background-image: url(${data(resolve(here, "cards/lantern.png"), "image/png")}); }`,
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

// Match the headline to the home page: its words, measured at 1440 x 810, sit in the film's screen at 176, 40, scaled 1568 / 1440.
const home = JSON.parse(readFileSync(resolve(here, "cards/home-h1.json"), "utf8")).h1.words;
const k = 1568 / 1440;
const target = home.map((w) => ({ text: w.text, x: 176 + w.x * k, y: 40 + w.y * k }));
await page.evaluate(() => window.render(9.9));
let ours = await page.evaluate(() => window.headlineWords());
const dy = (target[0].y - ours[0].y) / k;
await page.evaluate((top) => window.setHeadlineTop(top), dy);
await page.evaluate(() => window.render(9.9));
ours = await page.evaluate(() => window.headlineWords());
const off = target.map((w, i) => Math.max(Math.abs(w.x - ours[i].x), Math.abs(w.y - ours[i].y)));
console.log(`headline matched to the home page within ${Math.max(...off).toFixed(2)} px (${ours.map((w) => w.text).join(" ")})`);

async function render(name, [from, to]) {
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "8", "-pix_fmt", "yuv420p", `${out}/${name}.mkv`], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = from; i < to; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 96 });
    if (!ff.stdin.write(jpeg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`${name}: frames ${from} to ${to - 1}`);
}
if (process.env.STILLS) {
  // STILLS="1.2,3.0,..." saves single frames instead, to look at.
  for (const t of process.env.STILLS.split(",").map(Number)) {
    await page.evaluate((v) => window.render(v), t);
    await page.screenshot({ path: `${out}/card-${t.toFixed(2)}.png` });
  }
} else {
  await render("hook", HOOK);
  await render("outro", OUTRO);
}
await browser.close();
