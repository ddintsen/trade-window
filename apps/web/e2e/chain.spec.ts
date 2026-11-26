import { expect, test, type Page } from "@playwright/test";
import { call, installAdena, qeval, ugnotOf, type Chain, type Signer } from "./adena-standin";

// Two people trade through the deployed realm on a local chain: the app
// builds the messages, a stand-in for Adena signs them with test keys, and
// the chain settles. See e2e/README.md for the setup.

const chain: Chain = {
  remote: process.env.E2E_GNO_RPC ?? "http://127.0.0.1:26657",
  chainId: process.env.E2E_GNO_CHAIN_ID ?? "dev",
  home: process.env.E2E_GNOHOME ?? "",
};
const rooms = process.env.E2E_ROOMS_PATH ?? "";
/** A test collection registered with the rooms realm (gno/testing/lanterns), for the NFT trade. */
const lanterns = process.env.E2E_LANTERNS_PATH ?? "";
const alice: Signer = { key: process.env.E2E_MAKER_KEY ?? "alice", address: process.env.E2E_MAKER ?? "" };
const bob: Signer = { key: process.env.E2E_TAKER_KEY ?? "bob", address: process.env.E2E_TAKER ?? "" };
const WUGNOT = "gno.land/r/gnoland/wugnot";

test.skip(!chain.home || !rooms || !alice.address || !bob.address, "needs a local chain; see e2e/README.md");

function wugnotOf(address: string): bigint {
  const out = qeval(chain, `${WUGNOT}.BalanceOf(address("${address}"))`);
  const m = /\((\d+) int64\)/.exec(out);
  return BigInt(m ? m[1] : "0");
}

/** Connects the wallet unless the page reconnected it on its own, as it does after a reload. */
async function connect(page: Page) {
  const button = page.getByRole("button", { name: "Connect Adena" }).first();
  const wallet = page.getByRole("button", { name: "Wallet", exact: true });
  await expect(button.or(wallet).first()).toBeVisible();
  if (await button.isVisible()) await button.click();
  await expect(wallet).toBeVisible();
}

async function openRoomWith(page: Page, counterparty: string, openMarket = false): Promise<number> {
  await page.goto("/trade");
  await connect(page);
  await page.getByLabel("Their gno.land address").fill(counterparty);
  if (openMarket) await page.getByRole("radio", { name: "Open market" }).click();
  await page.getByRole("button", { name: "Open room" }).click();
  await expect(page).toHaveURL(/\/trade\/\d+$/, { timeout: 30_000 });
  return Number(page.url().split("/").pop());
}

/** Picks an item in the wallet, sets an amount and puts it in the window: one signature. */
async function putIn(page: Page, item: RegExp, amountLabel: string, amount: string, done: RegExp) {
  await page.getByRole("button", { name: /^(Add from your wallet|Add more)$/ }).click();
  const wallet = page.getByRole("dialog", { name: "Your wallet" });
  await wallet.getByRole("button", { name: item }).click({ timeout: 30_000 });
  if (amountLabel) await wallet.getByLabel(amountLabel).fill(amount);
  await wallet.getByRole("button", { name: "Add to your offer" }).click();
  await page.getByRole("button", { name: /^Put (it|all \d+) in the window$/ }).click();
  await expect(page.getByText(/^(Item|\d+ items) put in the window$/).last()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: done })).toBeVisible({ timeout: 20_000 });
}

const addCoins = (page: Page, gnot: string) => putIn(page, /^[\d,.]+ GNOT in your wallet$/, "Amount of GNOT", gnot, new RegExp(`^[\\d,.]+ GNOT, take back$`));
const addWrapped = (page: Page, amount: string) =>
  putIn(page, /^[\d,.]+ wrapped GNOT in your wallet$/, "Amount of wrapped GNOT", amount, /^[\d,.]+ wrapped GNOT, take back$/);

/** Looks at every item on their side, as the window asks before getting ready. */
async function lookAtTheirs(page: Page) {
  const unseen = page.getByRole("button", { name: /, not looked at yet/ });
  await expect(unseen.first()).toBeVisible({ timeout: 20_000 });
  while ((await unseen.count()) > 0) await unseen.first().click();
}

async function getReady(page: Page) {
  await lookAtTheirs(page);
  await page.getByRole("button", { name: "I am ready" }).first().click();
  await page.getByRole("dialog", { name: /^Get ready on version \d+$/ }).getByRole("button", { name: "I am ready" }).click();
  await expect(page.getByText("You are ready on this version.", { exact: true })).toBeVisible({ timeout: 30_000 });
}

test("a GNOT for wrapped GNOT trade settles in the transaction of the second lock", async ({ browser }) => {
  call(chain, bob, WUGNOT, "Deposit", [], "100000000ugnot"); // bob wraps 100 GNOT to have something to give
  const aliceWrappedBefore = wugnotOf(alice.address);
  const bobGnotBefore = ugnotOf(chain, bob.address);

  const a = await browser.newContext();
  const aliceTxs = await installAdena(a, chain, alice);
  const b = await browser.newContext();
  const bobTxs = await installAdena(b, chain, bob, { mode: "sync" }); // bob's wallet answers before the block
  const pa = await a.newPage();
  const pb = await b.newPage();

  const id = await openRoomWith(pa, bob.address);
  await expect(pa.getByRole("heading", { level: 2, name: "You give" })).toBeVisible();

  await pb.goto(`/trade/${id}`);
  await connect(pb);
  await addWrapped(pb, "25");
  // Approve and deposit went out as one transaction.
  const deposit = bobTxs.at(-1)!;
  expect(deposit.messages.map((m) => m.value.func)).toEqual(["Approve", "DepositToken"]);

  await pa.reload();
  await connect(pa);
  await addCoins(pa, "10");

  await lookAtTheirs(pa);
  await pa.getByRole("button", { name: "I am ready" }).first().click();
  const ready = pa.getByRole("dialog", { name: /^Get ready on version \d+$/ });
  await expect(ready.getByText("25", { exact: true })).toBeVisible();
  await ready.getByRole("button", { name: "I am ready" }).click();
  await expect(pa.getByText("You are ready on this version.", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Bob's page polls the chain and sees the ready mark.
  await pb.reload();
  await connect(pb);
  await lookAtTheirs(pb);
  await expect(pb.getByRole("button", { name: "Trade", exact: true }).first()).toBeEnabled({ timeout: 20_000 });
  await pb.getByRole("button", { name: "Trade", exact: true }).first().click();
  await pb.getByRole("dialog", { name: "Complete the trade" }).getByRole("button", { name: "Trade", exact: true }).click();
  // Each side receives the other's assets less the 0.5% fee.
  await expect(pb.getByText(/You received 9\.95 GNOT/)).toBeVisible({ timeout: 30_000 });
  await expect(pa.getByText(/You received 24\.875 wrapped GNOT/)).toBeVisible({ timeout: 20_000 });

  const room = qeval(chain, `${rooms}.RoomJSON(${id})`);
  expect(room).toContain('\\"status\\":\\"settled\\"');
  // Alice deployed the realm, so she is also the treasury: the fee on bob's side comes back to her.
  expect(wugnotOf(alice.address) - aliceWrappedBefore).toBe(25_000_000n);
  // Bob received 10 GNOT and paid fees and storage deposits for his two transactions.
  const bobGain = ugnotOf(chain, bob.address) - bobGnotBefore;
  expect(bobGain).toBeGreaterThan(8_000_000n);
  expect(bobGain).toBeLessThan(10_000_000n);
  expect(aliceTxs.every((t) => t.ok)).toBe(true);

  await a.close();
  await b.close();
});

test("a change after getting ready clears the mark, and the realm refuses the stale version", async ({ browser }) => {
  const a = await browser.newContext();
  await installAdena(a, chain, alice);
  const b = await browser.newContext();
  await installAdena(b, chain, bob);
  const pa = await a.newPage();
  const pb = await b.newPage();

  const id = await openRoomWith(pa, bob.address);
  await addCoins(pa, "1");
  await pb.goto(`/trade/${id}`);
  await connect(pb);
  await addCoins(pb, "2");

  await pa.reload();
  await connect(pa);
  await getReady(pa);
  const readyVersion = Number(/version (\d+)/.exec((await pa.getByText(/^Ready on version \d+$/).first().textContent()) ?? "")?.[1]);

  // Bob adds more; alice's page notices the new version.
  await pb.reload();
  await connect(pb);
  await pb.getByRole("button", { name: /^[\d,.]+ GNOT, take back$/ }).waitFor();
  await putIn(pb, /^[\d,.]+ GNOT in your wallet$/, "Amount of GNOT", "0.5", /^2\.5 GNOT, take back$/);
  await expect(pa.getByText("They changed their offer, so your ready mark was cleared", { exact: false })).toBeVisible({ timeout: 20_000 });

  // The realm itself refuses a lock that names the old version.
  expect(() => call(chain, bob, rooms, "Lock", [String(id), String(readyVersion)])).toThrow(/the room changed: review version/);

  // Cancelling returns both deposits.
  await pa.getByRole("button", { name: "Cancel trade" }).click();
  await pa.getByRole("button", { name: "Yes, cancel the trade" }).click();
  await expect(pa.getByText("Trade cancelled", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(pb.getByText("Trade cancelled", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  await a.close();
  await b.close();
});

test("getting ready while the room changes is refused, and the page says why", async ({ browser }) => {
  const a = await browser.newContext();
  await installAdena(a, chain, alice);
  const pa = await a.newPage();
  const id = await openRoomWith(pa, bob.address);
  await addCoins(pa, "1");
  call(chain, bob, rooms, "DepositCoins", [String(id)], "1000000ugnot");
  await pa.reload();
  await connect(pa);
  await lookAtTheirs(pa);
  await pa.getByRole("button", { name: "I am ready" }).first().click();
  const ready = pa.getByRole("dialog", { name: /^Get ready on version \d+$/ });
  await expect(ready).toBeVisible();

  // Hold the page's reads so it cannot notice the change before the click.
  let hold = true;
  await pa.route(`${chain.remote}/**`, async (route) => {
    while (hold) await new Promise((r) => setTimeout(r, 100));
    await route.continue();
  });
  call(chain, bob, rooms, "DepositCoins", [String(id)], "500000ugnot");
  await ready.getByRole("button", { name: "I am ready" }).click();
  await expect(pa.getByText("Getting ready did not go through")).toBeVisible({ timeout: 30_000 });
  await expect(pa.getByText(/the room changed: review version \d+ and lock again/)).toBeVisible();
  hold = false;

  // Once the page reads again it shows the new version, and their change is marked.
  await expect(pa.getByRole("button", { name: /, not looked at yet/ }).first()).toBeVisible({ timeout: 20_000 });
  await a.close();
});

test("both kinds of deposit can be taken back before a swap", async ({ browser }) => {
  call(chain, alice, WUGNOT, "Deposit", [], "20000000ugnot"); // alice wraps 20 GNOT
  const a = await browser.newContext();
  await installAdena(a, chain, alice);
  const pa = await a.newPage();
  const id = await openRoomWith(pa, bob.address);
  await addCoins(pa, "3");
  await addWrapped(pa, "5");
  const wrappedBefore = wugnotOf(alice.address);

  const takeBack = async (item: RegExp, label: string, amount: string, done: string) => {
    await pa.getByRole("button", { name: item }).click();
    await pa.getByLabel(label).fill(amount);
    await pa.getByRole("button", { name: "Take back", exact: true }).click();
    await expect(pa.getByText(done)).toBeVisible({ timeout: 30_000 });
  };
  await takeBack(/^5 wrapped GNOT, take back$/, "Amount of wrapped GNOT", "2", "Took back 2 wrapped GNOT");
  await takeBack(/^3 GNOT, take back$/, "Amount of GNOT", "1.5", "Took back 1.5 GNOT");

  expect(wugnotOf(alice.address) - wrappedBefore).toBe(2_000_000n);
  const room = qeval(chain, `${rooms}.RoomJSON(${id})`);
  expect(room).toContain('\\"amount\\":\\"1500000\\"');
  expect(room).toContain('\\"amount\\":\\"3000000\\"');
  await a.close();
});

test("an NFT goes in with its approval in the same transaction, and settles to the other side", async ({ browser }) => {
  test.skip(!lanterns, "set E2E_LANTERNS_PATH to a deployed test collection");
  const tokenId = String(Date.now() % 1_000_000);
  call(chain, bob, lanterns, "Mint", [tokenId]);

  const a = await browser.newContext();
  await installAdena(a, chain, alice);
  const b = await browser.newContext();
  const bobTxs = await installAdena(b, chain, bob);
  const pa = await a.newPage();
  const pb = await b.newPage();

  // The test collection is not on the verified list, so it trades in an open-market room.
  const id = await openRoomWith(pa, bob.address, true);
  await expect(pa.getByText(/^Open market: this room takes any registered token or NFT/)).toBeVisible();
  await addCoins(pa, "2");

  await pb.goto(`/trade/${id}`);
  await connect(pb);
  await putIn(pb, new RegExp(`^Lanterns #${tokenId} in your wallet$`), "", "", new RegExp(`^Lanterns #${tokenId}, not verified, take back$`));
  expect(bobTxs.at(-1)!.messages.map((m) => m.value.func)).toEqual(["Approve", "DepositNFT"]);

  await pa.reload();
  await connect(pa);
  await getReady(pa);
  await pb.reload();
  await connect(pb);
  await lookAtTheirs(pb);
  await pb.getByRole("button", { name: "Trade", exact: true }).first().click();
  await pb.getByRole("dialog", { name: "Complete the trade" }).getByRole("button", { name: "Trade", exact: true }).click();
  await expect(pb.getByText(/You received 1\.99 GNOT/)).toBeVisible({ timeout: 30_000 });

  const nft = qeval(chain, `${rooms}.NFTJSON("${lanterns}.LAMP", "${tokenId}")`);
  expect(nft).toContain(`\\"owner\\":\\"${alice.address}\\"`);
  await a.close();
  await b.close();
});

test("a named price is accepted in one transaction: the approval and Fill together", async ({ browser }) => {
  call(chain, bob, WUGNOT, "Deposit", [], "20000000ugnot"); // bob wraps 20 GNOT to pay with
  const aliceWrappedBefore = wugnotOf(alice.address);

  const a = await browser.newContext();
  const aliceTxs = await installAdena(a, chain, alice);
  const b = await browser.newContext();
  const bobTxs = await installAdena(b, chain, bob);
  const pa = await a.newPage();
  const pb = await b.newPage();

  const id = await openRoomWith(pa, bob.address);
  await addCoins(pa, "3");
  // Alice asks for 4 wrapped GNOT, picked from what bob's wallet holds.
  await pa.getByRole("button", { name: "Name your price" }).click();
  const askFor = pa.getByRole("dialog", { name: "Ask for" });
  await askFor.getByRole("button", { name: /^[\d,.]+ wrapped GNOT in their wallet$/ }).click({ timeout: 30_000 });
  await askFor.getByLabel("Amount of wrapped GNOT").fill("4");
  await askFor.getByRole("button", { name: "Add to your price" }).click();
  await pa.getByRole("button", { name: "Put up this price" }).click();
  await pa.getByRole("dialog", { name: "Put up your price" }).getByRole("button", { name: "Put up this price" }).click();
  await expect(pa.getByText("Your price is up", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(aliceTxs.at(-1)!.messages.map((m) => m.value.func)).toEqual(["Offer"]);

  await pb.goto(`/trade/${id}`);
  await connect(pb);
  await expect(pb.getByRole("button", { name: /^Wanted: 4 wrapped GNOT$/ })).toBeVisible({ timeout: 20_000 });
  await lookAtTheirs(pb);
  await pb.getByRole("button", { name: "Accept their price" }).first().click();
  const accept = pb.getByRole("dialog", { name: "Accept their price" });
  await expect(accept.getByText(/Fill\(\d+, \d+\)/)).toBeVisible();
  await accept.getByRole("button", { name: "Accept and trade" }).click();
  await expect(pb.getByText(/You received 2\.985 GNOT/)).toBeVisible({ timeout: 30_000 });
  // One signature: the token's approval and the fill in the same transaction.
  expect(bobTxs.at(-1)!.messages.map((m) => m.value.func)).toEqual(["Approve", "Fill"]);

  const room = qeval(chain, `${rooms}.RoomJSON(${id})`);
  expect(room).toContain('\\"status\\":\\"settled\\"');
  expect(wugnotOf(alice.address) - aliceWrappedBefore).toBe(4_000_000n);
  await a.close();
  await b.close();
});

test("the board: post a listing, then open a room with its owner", async ({ browser }) => {
  const b = await browser.newContext();
  await installAdena(b, chain, bob);
  const pb = await b.newPage();
  await pb.goto("/board/new");
  await connect(pb);
  const give = `${Date.now() % 100000} wrapped GNOT`;
  await pb.getByRole("radio", { name: "Selling" }).click();
  await pb.getByLabel("You give").fill(give);
  await pb.getByLabel("You want").fill("GNOT, one for one");
  await pb.getByLabel("Note, optional").fill("Partial fills welcome. Привет!");
  await pb.getByRole("button", { name: "Post listing" }).click();
  await expect(pb).toHaveURL(/\/board$/, { timeout: 30_000 });
  await expect(pb.getByText(give).first()).toBeVisible();

  const a = await browser.newContext();
  await installAdena(a, chain, alice);
  const pa = await a.newPage();
  await pa.goto("/board");
  await connect(pa);
  const row = pa.locator("li", { hasText: give }).first();
  await row.getByRole("link", { name: "Open a room with them" }).click();
  await expect(pa).toHaveURL(new RegExp(`/trade\\?with=${bob.address}`));
  await expect(pa.getByLabel("Their gno.land address")).toHaveValue(bob.address);

  // Bob closes his listing.
  await pb.reload();
  await connect(pb);
  const mine = pb.locator("li", { hasText: give }).first();
  await mine.getByRole("button", { name: "Close listing" }).click();
  await mine.getByRole("button", { name: "Close it" }).click();
  await expect(pb.getByText("Listing closed")).toBeVisible({ timeout: 30_000 });

  await a.close();
  await b.close();
});
