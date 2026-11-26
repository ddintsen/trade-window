// Records the site part of the film from the real app: the home page, then
// practice rooms, on the production build, driven by Playwright with a fake
// clock, so every frame is drawn at its own moment however slow the machine
// (the 3D scenes render in software WebGL here). Writes the frames as one
// high-quality video and a log of what happened when: the pointer, presses,
// keys, camera targets, lines and named moments, which compose.py and
// music.py read.
//
// Film time: capture time u = 0 is film time T0, where the opening cards
// dissolve into the home page. Every line and cut is synced to the score's
// bar grid (96 BPM, a bar every 2.5 s); docs/reel/SCRIPT.md has the list.
//
//   node reel/capture.mjs <out-dir> [base-url]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "../apps/web/node_modules/playwright/index.mjs";

const out = process.argv[2] ?? "/tmp/tw-reel";
const base = process.argv[3] ?? "http://localhost:3000";
const FPS = 30;
const VIEW = { width: 1440, height: 810 };
const DPR = 2;
/** Film time of the first captured frame: the cards dissolve into the home page from here. */
const T0 = 9.4;
/** Film time the closing cards take over (compose.py zooms through from 0.4 s before). */
const END = 63.75;
/** DRY=1 walks the whole film without taking frames: a quick check that every step still works and fits its bar. */
const DRY = process.env.DRY === "1";
// Each frame draws the 3D scene once: animation frames are queued and run by the frame loop.
const SCENE = !DRY || process.env.SCENE === "1";
mkdirSync(out, { recursive: true });

const ff = DRY ? null : spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "10", "-pix_fmt", "yuv420p", `${out}/raw.mkv`], { stdio: ["pipe", "inherit", "inherit"] });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DRY ? 1 : DPR });
const page = await context.newPage();
page.setDefaultTimeout(240_000);
await page.clock.install({ time: new Date("2026-10-15T18:30:00Z") });
await page.addInitScript(() => {
  const queue = [];
  let id = 0;
  window.requestAnimationFrame = (cb) => {
    queue.push({ id: ++id, cb });
    return id;
  };
  window.cancelAnimationFrame = (handle) => {
    const i = queue.findIndex((q) => q.id === handle);
    if (i >= 0) queue.splice(i, 1);
  };
  window.__reelFrame = () => {
    const now = performance.now();
    for (const q of queue.splice(0)) q.cb(now);
  };
  // The page is captured at 2x, the 3D scenes drawn at 1x: software WebGL draws a frame in seconds.
  Object.defineProperty(window, "devicePixelRatio", { get: () => 1 });
});

const log = { fps: FPS, view: VIEW, dpr: DPR, t0: T0, end: END, frames: [], clicks: [], keys: [], marks: {}, focus: [], captions: [], cuts: [] };
let n = 0;
let recording = true;
const late = [];
const cur = { x: 1180, y: 760, shown: false };
let down = false;
const now = () => n / FPS;
const film = () => T0 + now();

async function frame(count = 1) {
  for (let i = 0; i < count; i++) {
    await page.clock.runFor(1000 / FPS);
    await page.evaluate(() => window.__reelFrame());
    if (!recording) continue;
    if (ff) {
      const jpeg = await page.screenshot({ type: "jpeg", quality: 94 });
      if (!ff.stdin.write(jpeg)) await new Promise((r) => ff.stdin.once("drain", r));
    }
    log.frames.push([Math.round(cur.x * 10) / 10, Math.round(cur.y * 10) / 10, cur.shown ? 1 : 0, down ? 1 : 0]);
    n++;
    if (n % (DRY ? 600 : 150) === 0) console.log(`frame ${n} (film ${film().toFixed(1)} s)`);
  }
}
const hold = (seconds) => frame(Math.round(seconds * FPS));
const mark = (name) => (log.marks[name] = now());

/** Holds until film time `at`: lines and cuts land on the bar grid. Steps that run long are reported. */
async function sync(at, label) {
  // SNAP=1 with DRY=1: a still of each step just before its bar, to check the framing quickly.
  if (DRY && process.env.SNAP === "1") await page.screenshot({ path: `${out}/snap-${at.toFixed(2)}-${label.replace(/\W+/g, "-")}.png` });
  const gap = at - film();
  if (gap < -0.02) {
    late.push(`${label}: ${(-gap).toFixed(2)} s late`);
    console.log(`LATE ${label} by ${(-gap).toFixed(2)} s`);
    return;
  }
  await frame(Math.round(gap * FPS));
}

/** A line under the screen from now until film time `until`. */
const line = (text, until) => log.captions.push({ at: now(), until: until - T0 - 0.1, text });

/** The camera frames this box (or the whole view) from now; compose.py eases between targets. */
function frameBox(box, pad = 32) {
  log.focus.push({ at: now(), box: box && { x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 } });
}
async function focus(target, pad = 32) {
  frameBox(target ? await target.boundingBox() : null, pad);
}
/** Frames several things together: the smallest box around all of them. */
async function focusAll(targets, pad = 28) {
  const boxes = await Promise.all(targets.map((t) => t.first().boundingBox()));
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  frameBox({ x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y }, pad);
}
/** Frames a panel together with the tooltip open over one of its items. */
const focusTip = (panel, pad = 28) => focusAll([panel, page.getByRole("tooltip")], pad);

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
/** Moves the pointer along an eased path, a frame at a time, so hover states happen as a person's would. */
async function moveTo(target, seconds = 0.9, dx = 0, dy = 0) {
  const b = await target.boundingBox();
  const to = { x: b.x + b.width / 2 + dx, y: b.y + b.height / 2 + dy };
  const from = { ...cur };
  const count = Math.max(1, Math.round(seconds * FPS));
  cur.shown = true;
  for (let i = 1; i <= count; i++) {
    const u = ease(i / count);
    // A slight arc, as a hand moves.
    const arc = Math.sin(Math.PI * (i / count)) * Math.min(40, Math.hypot(to.x - from.x, to.y - from.y) * 0.08);
    cur.x = from.x + (to.x - from.x) * u;
    cur.y = from.y + (to.y - from.y) * u - arc;
    await page.mouse.move(cur.x, cur.y);
    await frame();
  }
}
async function press() {
  down = true;
  await page.mouse.down();
  log.clicks.push(now());
  await frame(3);
  await page.mouse.up();
  down = false;
  await frame(2);
}
async function type(text) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    log.keys.push(now());
    await frame(4);
  }
}
async function until(locator, maxSeconds = 20) {
  for (let i = 0; i < maxSeconds * FPS; i++) {
    if (await locator.first().isVisible().catch(() => false)) return;
    await frame();
  }
  await page.screenshot({ path: `${out}/stuck.png` });
  writeFileSync(`${out}/log.partial.json`, JSON.stringify(log));
  throw new Error(`not visible in time: ${locator} at film ${film().toFixed(2)} s`);
}
async function scrollTo(y, seconds = 0.8) {
  const from = await page.evaluate(() => window.scrollY);
  const count = Math.round(seconds * FPS);
  for (let i = 1; i <= count; i++) {
    await page.evaluate((v) => window.scrollTo(0, v), from + (y - from) * ease(i / count));
    await frame();
  }
}
/** Scrolls so an element's top sits `offset` px below the top of the view. */
async function scrollToElement(locator, offset, seconds) {
  const b = await locator.boundingBox();
  const y = await page.evaluate(() => window.scrollY);
  await scrollTo(Math.max(0, y + b.y - offset), seconds);
}
/** A hard cut to another page: it loads off camera, and the film goes on from the first frame it is ready. */
async function cut(url, ready) {
  recording = false;
  await page.goto(`${base}${url}`);
  await ready.waitFor();
  await frame(8);
  recording = true;
  log.cuts.push(now());
}

// ---------------------------------------------------------------- the film
// Off camera: a clean practice state, the trade scene in its slow-device mode.
await page.goto(`${base}/practice`);
await page.evaluate((scene) => {
  localStorage.clear();
  sessionStorage.clear();
  if (scene) localStorage.setItem("tw.scene", "still");
}, SCENE);

// The home page loads off camera; recording starts half a second after its scene first draws,
// so the panes light while the cards dissolve and cross just after.
recording = false;
await page.goto(`${base}/`);
await page.getByRole("heading", { level: 1 }).waitFor();
if (SCENE) {
  for (let i = 0; i < 30 * FPS && !(await page.locator("canvas").count()); i++) await frame();
  await frame(15);
}
recording = true;
mark("home");
await focus(null);

// 1. The promise, in the site's own scene.
await sync(10.0, "home line");
line("Trade Window: a trade room for two on gno.land.", 13.75);
await sync(13.75, "rules");

// 2. The rules, then the function that swaps.
line("Six rules, all on one screen.", 16.25);
await scrollToElement(page.getByRole("heading", { name: "Every rule, on one screen" }), 96, 1.0);
await sync(16.25, "code");
line("The swap is one function. Read it.", 18.75);
await scrollToElement(page.getByRole("heading", { name: "The swap is one function" }), 120, 1.0);
await sync(18.75, "rooms");

// 3. A room with the gnome trader.
await cut("/practice", page.getByRole("button", { name: "Open practice room" }));
mark("rooms");
line("Open a room. The gnome trader sits down.", 21.25);
const openForm = page.getByRole("form", { name: "Open a practice room" });
await focus(openForm, 40);
cur.x = 1000;
cur.y = 700;
await hold(0.3);
await moveTo(page.getByRole("button", { name: "Open practice room" }), 0.9);
await press();
await until(page.getByRole("heading", { level: 1, name: /Trade 1/ }));
mark("room");
await focus(null);
await sync(21.25, "deposit line");
line("He puts in 25 wrapped GNOT and a lantern.", 23.75);
await until(page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ }), 10);
const theirs = page.getByRole("region", { name: "You get" });
const mine = page.getByRole("region", { name: "You give" });
await focus(theirs, 60);
await sync(23.75, "tooltip");

// 4. Pointing at an item tells what it is.
line("Point at an item to see what it is.", 27.5);
await moveTo(page.getByRole("button", { name: /^25 wrapped GNOT/ }), 0.9, 0, 10);
mark("look");
await frame(2);
await focusTip(theirs);
await sync(27.5, "lantern");
line("An NFT crosses whole, with no fee.", 30.0);
await moveTo(page.getByRole("button", { name: /^Lanterns #7/ }), 0.7, 0, 10);
await frame(2);
await focusTip(theirs);
await sync(30.0, "wallet");

// 5. Your side; an unverified token stays out.
await focus(mine, 48);
await moveTo(page.getByRole("button", { name: "Add from your wallet" }), 0.7);
await press();
const wallet = page.getByRole("dialog", { name: "Your play wallet" });
await until(wallet);
await focus(wallet, 36);
await moveTo(wallet.getByRole("button", { name: /PEBBLE in your wallet, not verified$/ }), 0.6);
await press();
mark("unverified");
await sync(31.875, "unverified line");
line("A token nobody verified stays out.", 33.75);
await sync(33.75, "gnot");
line("Put in 10 GNOT. The contract holds it.", 37.5);
await moveTo(wallet.getByRole("button", { name: /^1,000 GNOT in your wallet$/ }), 0.6);
await press();
await frame(4);
await type("10");
await moveTo(wallet.getByRole("button", { name: "Add to your offer" }), 0.6);
await press();
await frame(6);
await focus(mine, 48);
await moveTo(page.getByRole("button", { name: /^Put it in the window$/ }), 0.6);
await press();
mark("deposited");
await sync(37.5, "ready");

// 6. Get ready on the version you checked.
const bar = page.getByRole("region", { name: "The trade" });
await focus(bar, 40);
line("Get ready on the version you checked.", 41.25);
await moveTo(page.getByRole("button", { name: "I am ready" }).first(), 0.7);
await press();
const readyDialog = page.getByRole("dialog", { name: /^Get ready on version \d+$/ });
await until(readyDialog);
await focus(readyDialog, 24);
await hold(1.0);
await moveTo(readyDialog.getByRole("button", { name: "I am ready" }), 0.6);
await press();
mark("ready");

// 7. He changes his offer: both ready marks clear. The line comes with the notice, off the grid:
// the trader answers at once, and the words must not lag the picture.
const notice = page.getByText(/They changed their offer/);
await until(notice, 10);
mark("changed");
line("He changes his offer? Your ready mark drops.", 43.75);
await focusAll([notice, page.getByRole("button", { name: /^30 wrapped GNOT/ })]);
await sync(43.75, "look again");
line("Look again. Nothing moved without you.", 46.25);
await focus(theirs, 60);
await moveTo(page.getByRole("button", { name: /^30 wrapped GNOT/ }), 0.8, 0, 10);
await frame(2);
await focusTip(theirs);
await sync(46.25, "swap");

// 8. Both ready: everything swaps at once.
await until(page.getByRole("button", { name: "Trade", exact: true }), 10);
line("Both ready: it all swaps in one transaction.", 51.25);
await focus(bar, 40);
await moveTo(page.getByRole("button", { name: "Trade", exact: true }).first(), 0.8);
await press();
const completeDialog = page.getByRole("dialog", { name: "Complete the trade" });
await until(completeDialog);
await focus(completeDialog, 24);
await hold(1.2);
await moveTo(completeDialog.getByRole("button", { name: "Trade", exact: true }), 0.6);
await press();
mark("settled");
await focus(null);
cur.shown = false;
await sync(51.25, "complete");
line("The lantern is yours. No middleman needed.", 53.75);
const received = page.getByText(/^You received/);
await focusAll([received, theirs.getByRole("button").first()]);
await sync(53.75, "price");

// 9. Or take a named price in one step.
await focus(null);
line("In a hurry? Take a named price.", 58.75);
cur.shown = true;
await moveTo(page.getByRole("link", { name: "Practice rooms" }), 0.9);
await press();
await page.getByRole("button", { name: "Accept the trader's price" }).waitFor();
await frame(4);
await scrollToElement(page.getByRole("region", { name: "Trade at a named price" }), 330, 0.7);
await moveTo(page.getByRole("button", { name: "Accept the trader's price" }), 0.8);
await press();
await until(page.getByRole("heading", { level: 1, name: /Trade 2/ }));
mark("price");
await focus(theirs, 60);
await sync(58.75, "price look");
line("Look, accept, and it trades in one step.", 63.75);
await moveTo(page.getByRole("button", { name: /not looked at yet/ }).first(), 0.8, 0, 10);
await frame(2);
await focusTip(theirs);
await hold(0.9);
await focus(bar, 40);
await moveTo(page.getByRole("button", { name: "Accept their price" }).first(), 0.7);
await press();
const acceptDialog = page.getByRole("dialog", { name: "Accept their price" });
await until(acceptDialog);
await focus(acceptDialog, 24);
await hold(0.7);
await moveTo(acceptDialog.getByRole("button", { name: "Accept and trade" }), 0.6);
await press();
mark("price-settled");
cur.shown = false;
await frame(4);
await focusAll([received, theirs.getByRole("button").first()]);
await sync(END, "end");
mark("end");

if (ff) {
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
log.frames_total = n;
log.late = late;
writeFileSync(`${out}/log.json`, JSON.stringify(log));
console.log(`done: ${n} frames, film ${T0} to ${film().toFixed(2)} s; ${late.length ? `late: ${late.join("; ")}` : "every step on its bar"}`);
await browser.close();
