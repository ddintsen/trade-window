import { expect, test } from "@playwright/test";
import { call, installAdena, qeval, type Chain, type Signer } from "./adena-standin";

// Screenshots of the on-chain screens for design review, not assertions.
//   E2E_SCREENS=/tmp/shots plus the chain variables from e2e/README.md

const dir = process.env.E2E_SCREENS ?? "";
const chain: Chain = {
  remote: process.env.E2E_GNO_RPC ?? "http://127.0.0.1:26657",
  chainId: process.env.E2E_GNO_CHAIN_ID ?? "dev",
  home: process.env.E2E_GNOHOME ?? "",
};
const rooms = process.env.E2E_ROOMS_PATH ?? "";
const alice: Signer = { key: process.env.E2E_MAKER_KEY ?? "alice", address: process.env.E2E_MAKER ?? "" };
const bob: Signer = { key: process.env.E2E_TAKER_KEY ?? "bob", address: process.env.E2E_TAKER ?? "" };

test.skip(!dir || !chain.home || !rooms, "set E2E_SCREENS and the chain variables");

for (const width of [1440, 390]) {
  test(`on-chain screens at ${width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
    await installAdena(ctx, chain, alice);
    const page = await ctx.newPage();

    // A room where bob deposited and got ready: alice looks at his item and sees "Trade".
    call(chain, alice, rooms, "Open", [bob.address, "1440"]);
    const id = Number(/\\"id\\":(\d+)/.exec(qeval(chain, `${rooms}.RoomsOfJSON("${alice.address}", 0, 1)`))?.[1]);
    const realm = /\("(g1[0-9a-z]+)" string\)/.exec(qeval(chain, `${rooms}.Address()`))?.[1] ?? "";
    call(chain, alice, rooms, "DepositCoins", [String(id)], "12500000ugnot");
    call(chain, bob, "gno.land/r/gnoland/wugnot", "Deposit", [], "40000000ugnot");
    call(chain, bob, "gno.land/r/gnoland/wugnot", "Approve", [realm, "30000000"]);
    call(chain, bob, rooms, "DepositToken", [String(id), "gno.land/r/gnoland/wugnot.wugnot", "30000000"]);
    call(chain, bob, rooms, "Lock", [String(id), "3"]);

    await page.goto(`/trade/${id}`);
    await page.getByRole("button", { name: "Connect Adena" }).first().click();
    await page.getByRole("button", { name: /, not looked at yet$/ }).first().click({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Trade", exact: true }).first()).toBeEnabled({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/chain-room-${width}.png`, fullPage: true });

    await page.goto("/trade");
    await expect(page.getByText(/rooms? (is|are) waiting for you/i)).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${dir}/chain-lobby-${width}.png`, fullPage: true });

    await page.goto("/board");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${dir}/chain-board-${width}.png`, fullPage: true });

    await page.goto("/");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${dir}/chain-home-${width}.png`, fullPage: true });
    await ctx.close();
  });
}
