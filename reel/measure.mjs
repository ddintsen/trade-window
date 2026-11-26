// One-off: measures the home headline for the match cut and saves the item icons the cards use.
import { writeFileSync } from "node:fs";
import { chromium } from "../apps/web/node_modules/playwright/index.mjs";
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
await page.addInitScript(() => localStorage.setItem("tw.scene", "off"));
await page.goto("http://127.0.0.1:3000/");
await page.waitForTimeout(800);
const h1 = await page.evaluate(() => {
  const el = document.querySelector("h1");
  const cs = getComputedStyle(el);
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const re = /\S+/g;
    let m;
    while ((m = re.exec(node.textContent))) {
      const r = document.createRange();
      r.setStart(node, m.index);
      r.setEnd(node, m.index + m[0].length);
      const b = r.getBoundingClientRect();
      words.push({ text: m[0], x: b.x, y: b.y, w: b.width, h: b.height });
    }
  }
  return { fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontFamily: cs.fontFamily, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, fvs: cs.fontVariationSettings, color: cs.color, words };
});
const p = await page.evaluate(() => { const el = document.querySelector("h1 + p"); const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, text: el.textContent }; });
writeFileSync(`${out}/home-h1.json`, JSON.stringify({ h1, p }, null, 1));
// Item icons from a practice room.
await page.evaluate(() => localStorage.setItem("tw.scene", "off"));
await page.goto("http://127.0.0.1:3000/practice");
await page.getByRole("button", { name: "Open practice room" }).click();
await page.getByRole("button", { name: /^25 wrapped GNOT/ }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
const grab = async (name) => page.getByRole("button", { name }).first().evaluate((b) => getComputedStyle(b.querySelector("span[style]")).backgroundImage.slice(5, -2));
const icons = { crate: await grab(/^25 wrapped GNOT/), lantern: await grab(/^Lanterns #7/) };
await page.getByRole("button", { name: "Add from your wallet" }).click();
const wallet = page.getByRole("dialog");
await wallet.getByRole("button", { name: /GNOT in your wallet$/ }).first().waitFor();
await page.waitForTimeout(1500);
icons.coin = await wallet.getByRole("button", { name: /^1,000 GNOT in your wallet$/ }).evaluate((b) => getComputedStyle(b.querySelector("span[style]")).backgroundImage.slice(5, -2));
icons.pebbles = await wallet.getByRole("button", { name: /PEBBLE in your wallet/ }).evaluate((b) => getComputedStyle(b.querySelector("span[style]")).backgroundImage.slice(5, -2));
for (const [k, v] of Object.entries(icons)) writeFileSync(`${out}/${k}.png`, Buffer.from(v.split(",")[1], "base64"));
await browser.close();
