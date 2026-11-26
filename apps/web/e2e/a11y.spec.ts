import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Automated accessibility checks (WCAG 2.1 A and AA rules that axe can
// test). They catch contrast, names, labels and structure, not everything.

async function check(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")})`);
  expect(summary).toEqual([]);
}

for (const path of ["/", "/practice", "/trade", "/board", "/board/new", "/how", "/contract", "/request", "/launch", "/no-such-page"]) {
  test(`no detectable violations on ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await check(page);
  });
}

test("no detectable violations in a practice trade mid-trade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.getByRole("button", { name: "Open practice room" }).click();
  await expect(page).toHaveURL(/\/practice\/\d+$/);
  await expect(page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ })).toBeVisible();

  await page.getByRole("button", { name: "Add from your wallet" }).click();
  const wallet = page.getByRole("dialog", { name: "Your play wallet" });
  await wallet.getByRole("button", { name: /^[\d,.]+ GNOT in your wallet$/ }).click();
  await check(page);
  await wallet.getByLabel("Amount of GNOT").fill("3");
  await wallet.getByRole("button", { name: "Add to your offer" }).click();
  await page.getByRole("button", { name: "Put it in the window" }).click();
  await expect(page.getByText("Item put in the window")).toBeVisible();
  await page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ }).focus();
  // The chat, with a line from the trader in it.
  await expect(page.getByRole("log", { name: "Messages" }).getByText(/A lantern and 25 wGNOT/)).toBeVisible();
  await check(page);
});
