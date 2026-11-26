import { expect, test, type Page } from "@playwright/test";

// A whole practice trade in the trade window: open, put items in from the
// wallet, look at theirs, get ready, see the partner change the offer, get
// ready on the new version, trade. Runs in any build; no chain involved.

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/practice");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
});

async function openTrade(page: Page) {
  await page.getByRole("button", { name: "Open practice room" }).click();
  await expect(page).toHaveURL(/\/practice\/\d+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Trade");
}

/** Picks an item in the wallet and stages an amount of it. */
async function stageFromWallet(page: Page, item: RegExp, amountLabel: string, amount: string) {
  await page.getByRole("button", { name: /^(Add from your wallet|Add more)$/ }).click();
  const wallet = page.getByRole("dialog", { name: "Your play wallet" });
  await wallet.getByRole("button", { name: item }).click();
  await wallet.getByLabel(amountLabel).fill(amount);
  await wallet.getByRole("button", { name: "Add to your offer" }).click();
  await expect(wallet).toBeHidden();
}

async function putIn(page: Page) {
  await page.getByRole("button", { name: /^Put (it|all \d+) in the window$/ }).click();
  await expect(page.getByText(/^(Item|\d+ items) put in the window$/)).toBeVisible();
}

const COIN = /^[\d,.]+ GNOT in your wallet$/;

test("a practice trade completes on the version both sides got ready on", async ({ page }) => {
  await page.addInitScript(() => {
    // Exercise the promise return value even in browsers with the older API.
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      scrollIntoView.call(this, options);
      return Promise.resolve();
    };
  });
  await openTrade(page);

  // The partner sits down and puts 25 wrapped GNOT and a lantern NFT in their offer.
  const theirs = page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ });
  const lantern = page.getByRole("button", { name: /^Lanterns #7, not looked at yet$/ });
  await expect(theirs).toBeVisible();
  await expect(lantern).toBeVisible();

  await stageFromWallet(page, COIN, "Amount of GNOT", "10");
  await putIn(page);
  await expect(page.getByRole("button", { name: /^10 GNOT, take back$/ })).toBeVisible();

  // Getting ready waits until each of their items has been looked at.
  await expect(page.getByRole("button", { name: "I am ready" }).first()).toBeDisabled();
  await theirs.click();
  await expect(page.getByRole("button", { name: "I am ready" }).first()).toBeDisabled();
  await lantern.click();
  await page.getByRole("button", { name: "I am ready" }).first().click();
  const ready = page.getByRole("dialog", { name: /^Get ready on version \d+$/ });
  await expect(ready.getByText("25", { exact: true })).toBeVisible();
  await expect(ready.getByText("Lanterns #7", { exact: true })).toBeVisible();
  await ready.getByRole("button", { name: "I am ready" }).click();
  await expect(page.getByText(/^Ready on version \d+$/).first()).toBeVisible();

  // The partner adds 5 more: the ready mark clears and the change is marked.
  await expect(page.getByText(/They changed their offer, so your ready mark was cleared/)).toBeVisible();
  await expect(page.getByText("+5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^30 wrapped GNOT, not looked at yet, changed by \+5$/ }).click();

  // They get ready on the new version; our confirmation completes the trade.
  await expect(page.getByRole("button", { name: "Trade", exact: true }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Trade", exact: true }).first().click();
  const complete = page.getByRole("dialog", { name: "Complete the trade" });
  await complete.getByRole("button", { name: "Trade", exact: true }).click();
  await expect(page.getByText("Trade complete", { exact: true })).toBeVisible();
  // What arrives is after the 0.5% fee: 30 wrapped GNOT less 0.15.
  await expect(page.getByText(/You received 29\.85 wrapped GNOT and Lanterns #7 and gave 10 GNOT/)).toBeVisible();

  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Closed rooms" })).toBeVisible();
  await expect(page.getByText("990", { exact: true })).toBeVisible();
  await expect(page.getByText("229.85", { exact: true })).toBeVisible();
  await expect(page.getByText("Gnome hats #12, Lanterns #3, Lanterns #7")).toBeVisible();
});

test("a big amount shows as a short count, and an NFT goes in and comes back whole", async ({ page }) => {
  await openTrade(page);
  await stageFromWallet(page, /^500,000 MOSS in your wallet$/, "Amount of MOSS", "500000");
  await page.getByRole("button", { name: "Add more" }).click();
  const wallet = page.getByRole("dialog", { name: "Your play wallet" });
  await wallet.getByRole("button", { name: /^Gnome hats #12 in your wallet$/ }).click();
  await wallet.getByRole("button", { name: "Add to your offer" }).click();
  // Staged items wait in the slots until they are put in.
  await expect(page.getByRole("button", { name: /^500,000 MOSS, not sent yet, remove$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Gnome hats #12, not sent yet, remove$/ })).toBeVisible();
  await page.getByRole("button", { name: "Put all 2 in the window" }).click();
  await expect(page.getByText("2 items put in the window")).toBeVisible();

  // The slot shows 500K; its name and the confirmation carry the exact amount.
  const moss = page.getByRole("button", { name: /^500,000 MOSS, take back$/ });
  await expect(moss).toBeVisible();
  await expect(moss.getByText("500K", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Gnome hats #12, take back$/ }).click();
  await page.getByRole("button", { name: "Take back", exact: true }).click();
  await expect(page.getByText("Took back Gnome hats #12")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Gnome hats #12, take back$/ })).toHaveCount(0);
});

test("an open seat is taken by the partner, and cancelling sends everything home", async ({ page }) => {
  await page.getByRole("radio", { name: "Anyone with the link" }).click();
  await openTrade(page);
  // The partner takes the open seat and puts their items in.
  await expect(page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ })).toBeVisible();

  await stageFromWallet(page, COIN, "Amount of GNOT", "7.5");
  await putIn(page);

  await page.getByRole("button", { name: "Cancel trade" }).click();
  await page.getByRole("button", { name: "Yes, cancel the trade" }).click();
  await expect(page.getByText("Trade cancelled", { exact: true }).first()).toBeVisible();

  await page.goto("/practice");
  await expect(page.getByText("1,000", { exact: true })).toBeVisible();
});

test("refuses amounts it cannot take", async ({ page }) => {
  await openTrade(page);
  await page.getByRole("button", { name: "Add from your wallet" }).click();
  const wallet = page.getByRole("dialog", { name: "Your play wallet" });
  await wallet.getByRole("button", { name: COIN }).click();
  const amount = wallet.getByLabel("Amount of GNOT");
  await amount.fill("5000");
  await expect(wallet.getByText("More than you have")).toBeVisible();
  await amount.fill("1.1234567");
  await expect(wallet.getByText("Use at most 6 decimals")).toBeVisible();
  await expect(wallet.getByRole("button", { name: "Add to your offer" })).toBeDisabled();
});

test("takes part of an item back out of the window", async ({ page }) => {
  await openTrade(page);
  await stageFromWallet(page, COIN, "Amount of GNOT", "10");
  await putIn(page);

  await page.getByRole("button", { name: /^10 GNOT, take back$/ }).click();
  await page.getByLabel("Amount of GNOT").fill("4");
  await page.getByRole("button", { name: "Take back", exact: true }).click();
  await expect(page.getByText("Took back 4 GNOT")).toBeVisible();
  await expect(page.getByRole("button", { name: /^6 GNOT, take back$/ })).toBeVisible();
});

test("two items go in with one confirmation", async ({ page }) => {
  await openTrade(page);
  await stageFromWallet(page, COIN, "Amount of GNOT", "2");
  await stageFromWallet(page, /^[\d,.]+ wrapped GNOT in your wallet$/, "Amount of wrapped GNOT", "3");
  await expect(page.getByRole("button", { name: /^2 GNOT, not sent yet, remove$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^3 wrapped GNOT, not sent yet, remove$/ })).toBeVisible();
  await page.getByRole("button", { name: "Put all 2 in the window" }).click();
  await expect(page.getByText("2 items put in the window")).toBeVisible();
  await expect(page.getByRole("button", { name: /^2 GNOT, take back$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^3 wrapped GNOT, take back$/ })).toBeVisible();
});

test("accepting the trader's named price completes the trade in one step, after the fee", async ({ page }) => {
  await page.getByRole("button", { name: "Accept the trader's price" }).click();
  await expect(page).toHaveURL(/\/practice\/\d+$/);
  // What they ask for is shown on your side as wanted; what you get is theirs.
  await expect(page.getByRole("button", { name: /^Wanted: 40 GNOT$/ })).toBeVisible();
  // As in any trade, you look at what you get before you can accept.
  await expect(page.getByRole("button", { name: "Accept their price" }).first()).toBeDisabled();
  await page.getByRole("button", { name: /^Lanterns #7, not looked at yet$/ }).click();
  await page.getByRole("button", { name: "Accept their price" }).first().click();
  const accept = page.getByRole("dialog", { name: "Accept their price" });
  await expect(accept.getByText("They receive 39.8")).toBeVisible();
  await expect(accept.getByText(/keeps 0\.5% of each coin and token/)).toBeVisible();
  await accept.getByRole("button", { name: "Accept and trade" }).click();
  await expect(page.getByText("Trade complete", { exact: true })).toBeVisible();
  await expect(page.getByText(/You received Lanterns #7 and gave 40 GNOT/)).toBeVisible();
});

test("a price you name is filled by the trader", async ({ page }) => {
  await page.getByRole("button", { name: "Name your price to the trader" }).click();
  await expect(page).toHaveURL(/\/practice\/\d+$/);
  await stageFromWallet(page, COIN, "Amount of GNOT", "10");
  await putIn(page);
  await page.getByRole("button", { name: "Name your price" }).click();
  const askFor = page.getByRole("dialog", { name: "Ask for" });
  await askFor.getByRole("button", { name: /^1,000 wrapped GNOT in their wallet$/ }).click();
  await askFor.getByLabel("Amount of wrapped GNOT").fill("12");
  await askFor.getByRole("button", { name: "Add to your price" }).click();
  await expect(page.getByRole("button", { name: /^Wanted: 12 wrapped GNOT$/ })).toBeVisible();
  await page.getByRole("button", { name: "Put up this price" }).click();
  const confirm = page.getByRole("dialog", { name: "Put up your price" });
  await confirm.getByRole("button", { name: "Put up this price" }).click();
  await expect(page.getByText("Trade complete", { exact: true })).toBeVisible();
  await expect(page.getByText(/You received 11\.94 wrapped GNOT and gave 10 GNOT/)).toBeVisible();
});

test("an ordinary room refuses an unverified token; an open-market room takes it and says so", async ({ page }) => {
  await openTrade(page);
  await page.getByRole("button", { name: "Add from your wallet" }).click();
  const wallet = page.getByRole("dialog", { name: "Your play wallet" });
  await wallet.getByRole("button", { name: /^2,000 PEBBLE in your wallet, not verified$/ }).click();
  await expect(wallet.getByText(/Not verified: only open-market rooms take it/)).toBeVisible();
  await expect(wallet.getByRole("button", { name: "Add to your offer" })).toHaveCount(0);
  await wallet.getByRole("button", { name: "Close" }).click();

  await page.goto("/practice");
  await page.getByRole("radio", { name: "Open market" }).click();
  await expect(page.getByText(/Anyone can register a token called GNOT or USDC/)).toBeVisible();
  await openTrade(page);
  await expect(page.getByText(/^Open market: this room takes any registered token or NFT/)).toBeVisible();
  await stageFromWallet(page, /^2,000 PEBBLE in your wallet$/, "Amount of PEBBLE", "5");
  await putIn(page);
  await expect(page.getByRole("button", { name: /^5 PEBBLE, not verified, take back$/ })).toBeVisible();
});

test("pointing at an item shows what it is, drawn over the window rather than cut off by it", async ({ page }) => {
  await openTrade(page);
  const theirs = page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ });
  await expect(theirs).toBeVisible();
  await theirs.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("25 wrapped GNOT");
  await expect(tip).toContainText("GRC20 token");
  await expect(tip).toContainText(/You receive 24\.875 after the 0\.5% fee/);
  // The panels have stepped corners cut with clip-path; the tooltip must not be cut with them.
  const box = (await tip.boundingBox())!;
  const top = await page.evaluate(
    ([x, y]) => {
      // The tooltip ignores the pointer; let it be hit for this one check.
      const el = document.querySelector<HTMLElement>('[role="tooltip"]')!;
      el.style.pointerEvents = "auto";
      const hit = document.elementFromPoint(x, y)?.closest('[role="tooltip"]') === el;
      el.style.pointerEvents = "";
      return hit;
    },
    [box.x + box.width / 2, box.y + 12],
  );
  expect(top).toBe(true);
});

test("the chat: the gnome trader talks terms, and what is said is not part of the deal", async ({ page }) => {
  await openTrade(page);
  const chat = page.getByRole("region", { name: "Chat" });
  const log = chat.getByRole("log", { name: "Messages" });
  await expect(chat.getByText("Messages are not part of the deal: only what is in the window counts.")).toBeVisible();
  // The trader says what it put in.
  await expect(log.getByText("A lantern and 25 wGNOT from me. What do you put in?")).toBeVisible();

  const box = chat.getByRole("textbox", { name: "Message" });
  await box.fill("Would you give me a discount on the lantern?");
  await box.press("Enter");
  await expect(box).toHaveValue("");
  await expect(log.getByText("Would you give me a discount on the lantern?")).toBeVisible();
  await expect(log.getByText(/^My lantern is worth what I ask/)).toBeVisible();
  // Saying it moves nothing: their side is as it was.
  await expect(page.getByRole("button", { name: /^25 wrapped GNOT, not looked at yet$/ })).toBeVisible();

  // The conversation outlives a reload.
  await page.reload();
  await expect(log.getByText("Would you give me a discount on the lantern?")).toBeVisible();

  // A closed trade keeps its chat to read, not to write.
  await page.getByRole("button", { name: "Cancel trade" }).click();
  await page.getByRole("button", { name: "Yes, cancel the trade" }).click();
  await expect(chat.getByText("The trade is closed, so the chat is read-only.")).toBeVisible();
  await expect(box).toHaveCount(0);
  await expect(log.getByText("Would you give me a discount on the lantern?")).toBeVisible();
});
