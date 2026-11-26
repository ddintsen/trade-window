import { expect, test, type Page } from "@playwright/test";
import { installAdena, makeAccount, signArbitrary, type Chain, type Signer } from "./adena-standin";

// The two traders of a room on a local chain talk in its chat. Each signs
// in once with an off-chain signature (Adena's SignArbitrary, played by the
// stand-in), which sends no transaction; nobody else can read the chat.
// Needs the chain set up as for chain.spec.ts, and the app run with
// `npm run dev` (its chat keeps messages in memory); see e2e/README.md.

const chain: Chain = {
  remote: process.env.E2E_GNO_RPC ?? "http://127.0.0.1:26657",
  chainId: process.env.E2E_GNO_CHAIN_ID ?? "dev",
  home: process.env.E2E_GNOHOME ?? "",
};
const rooms = process.env.E2E_ROOMS_PATH ?? "";
/** Funds the accounts this test makes. */
const funder: Signer = { key: process.env.E2E_MAKER_KEY ?? "alice", address: process.env.E2E_MAKER ?? "" };

test.skip(!chain.home || !rooms || !funder.address, "needs a local chain; see e2e/README.md");

async function connect(page: Page) {
  const button = page.getByRole("button", { name: "Connect Adena" }).first();
  const wallet = page.getByRole("button", { name: "Wallet", exact: true });
  await expect(button.or(wallet).first()).toBeVisible();
  if (await button.isVisible()) await button.click();
  await expect(wallet).toBeVisible();
}

/** With E2E_SCREENS set to a folder, the chat is photographed in its states for design review. */
async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SCREENS;
  if (dir) await page.getByRole("region", { name: "Chat" }).screenshot({ path: `${dir}/chat-${name}.png` });
}

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-5)}`;

test("the two traders talk in the room's chat after signing in, and nobody else can read it", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const stamp = Date.now().toString(36);
  const maker = makeAccount(chain, `chat-maker-${stamp}`, funder);
  const taker = makeAccount(chain, `chat-taker-${stamp}`, funder);
  const stranger = makeAccount(chain, `chat-stranger-${stamp}`, funder);

  const makerContext = await browser.newContext();
  const makerLog = await installAdena(makerContext, chain, maker);
  const a = await makerContext.newPage();
  await a.goto("/trade");
  await connect(a);
  await a.getByLabel("Their gno.land address").fill(taker.address);
  await a.getByRole("button", { name: "Open room" }).click();
  await expect(a).toHaveURL(/\/trade\/\d+$/, { timeout: 30_000 });
  const id = Number(a.url().split("/").pop());

  // Signing in is one off-chain signature over a text that says what it is.
  const chatA = a.getByRole("region", { name: "Chat" });
  await shot(a, "sign-in");
  await chatA.getByRole("button", { name: "Sign in to chat" }).click();
  const boxA = chatA.getByRole("textbox", { name: "Message" });
  await expect(boxA).toBeVisible({ timeout: 20_000 });
  const signedIn = makerLog.at(-1)!;
  expect(signedIn.messages[0].type).toBe("sign/MsgSignData");
  expect(String(signedIn.messages[0].value.data)).toContain("asks you to sign in to trade chat as");
  expect(String(signedIn.messages[0].value.data)).toContain("It is not a transaction and costs nothing.");
  expect(makerLog.filter((r) => r.messages[0].type !== "sign/MsgSignData")).toHaveLength(1); // only the room's Open

  await boxA.fill("Would you take 20 GNOT for your lantern?");
  await boxA.press("Enter");
  await expect(chatA.getByRole("log").getByText("Would you take 20 GNOT for your lantern?")).toBeVisible();

  // The other trader opens the room, signs in and reads it under the maker's address.
  const takerContext = await browser.newContext();
  await installAdena(takerContext, chain, taker);
  const b = await takerContext.newPage();
  await b.goto(`/trade/${id}`);
  await connect(b);
  const chatB = b.getByRole("region", { name: "Chat" });
  await chatB.getByRole("button", { name: "Sign in to chat" }).click();
  const logB = chatB.getByRole("log");
  await expect(logB.getByText("Would you take 20 GNOT for your lantern?")).toBeVisible({ timeout: 20_000 });
  await expect(logB.getByText(short(maker.address))).toBeVisible();
  await chatB.getByRole("textbox", { name: "Message" }).fill("25, and it is yours.");
  await chatB.getByRole("button", { name: "Send" }).click();

  // It reaches the maker within a few seconds, with no reload.
  await expect(chatA.getByRole("log").getByText("25, and it is yours.")).toBeVisible({ timeout: 15_000 });
  await shot(a, "talk");

  // A reload keeps the session: no second signature.
  const signatures = makerLog.length;
  await a.reload();
  await expect(a.getByRole("region", { name: "Chat" }).getByRole("log").getByText("25, and it is yours.")).toBeVisible({ timeout: 20_000 });
  expect(makerLog.length).toBe(signatures);

  // Someone who is not in the trade can sign in, but cannot read or write its chat.
  const { nonce, text } = await (await request.post("/api/chat/nonce", { data: { address: stranger.address } })).json();
  const session = await (await request.post("/api/chat/session", { data: { nonce, signature: signArbitrary(chain, stranger, text).signature } })).json();
  expect(session.address).toBe(stranger.address);
  const peek = await request.get(`/api/chat/rooms/${id}`, { headers: { Authorization: `Bearer ${session.token}` } });
  expect(peek.status()).toBe(403);
  const write = await request.post(`/api/chat/rooms/${id}`, { headers: { Authorization: `Bearer ${session.token}` }, data: { text: "let me in" } });
  expect(write.status()).toBe(403);
  // A signature by the stranger does not open the maker's session.
  const n2 = await (await request.post("/api/chat/nonce", { data: { address: maker.address } })).json();
  const forged = await request.post("/api/chat/session", { data: { nonce: n2.nonce, signature: signArbitrary(chain, stranger, n2.text).signature } });
  expect(forged.status()).toBe(403);
  // And nothing without a session.
  expect((await request.get(`/api/chat/rooms/${id}`)).status()).toBe(401);

  await makerContext.close();
  await takerContext.close();
});

test("an Adena that cannot sign messages says to update it", async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const maker = makeAccount(chain, `chat-old-${stamp}`, funder);
  const taker = makeAccount(chain, `chat-old-taker-${stamp}`, funder);
  const context = await browser.newContext();
  await installAdena(context, chain, maker, { noSignArbitrary: true });
  const page = await context.newPage();
  await page.goto("/trade");
  await connect(page);
  await page.getByLabel("Their gno.land address").fill(taker.address);
  await page.getByRole("button", { name: "Open room" }).click();
  await expect(page).toHaveURL(/\/trade\/\d+$/, { timeout: 30_000 });
  const chat = page.getByRole("region", { name: "Chat" });
  await chat.getByRole("button", { name: "Sign in to chat" }).click();
  await expect(chat.getByRole("alert")).toHaveText(/This Adena cannot sign messages yet\. Update Adena/);
  await context.close();
});
