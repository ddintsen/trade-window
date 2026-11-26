import { expect, test } from "@playwright/test";
import { installAdena, qeval, type Chain, type Signer } from "./adena-standin";

// The owner puts Trade Window on a network from the launch page: registers a
// name, publishes rooms and board from their own wallet, and the page shows
// them as admin and treasury with the site's settings. A local chain with the
// name registry stands in for Onyx; see e2e/README.md.

const chain: Chain = {
  remote: process.env.E2E_GNO_RPC ?? "http://127.0.0.1:26657",
  chainId: process.env.E2E_GNO_CHAIN_ID ?? "dev",
  home: process.env.E2E_GNOHOME ?? "",
};
/** An account with coins and no name yet: it becomes the owner. */
const owner: Signer = { key: process.env.E2E_LAUNCH_KEY ?? "bob", address: process.env.E2E_LAUNCH_ADDRESS ?? "" };
const name = process.env.E2E_LAUNCH_NAME ?? "nym-launchtest123";

test.skip(!chain.home || !owner.address, "needs a local chain with gno.land/r/sys/namereg/v0; see e2e/README.md");

test("the owner registers a name and publishes both realms, and ends up as their admin and treasury", async ({ context, page }) => {
  test.setTimeout(480_000);
  const signed = await installAdena(context, chain, owner);
  await page.goto("/launch");
  await page.getByRole("button", { name: "Connect Adena" }).click();
  await expect(page.getByText(owner.address).first()).toBeVisible();

  await page.getByLabel("Name to register").fill(name);
  await page.getByRole("button", { name: "Register name" }).click();
  await expect(page.getByText(`The realms go under your name ${name}`)).toBeVisible({ timeout: 90_000 });

  const rooms = page.getByRole("region", { name: "Rooms realm" });
  await expect(rooms.getByText(`gno.land/r/${name}/rooms`)).toBeVisible();
  await rooms.getByRole("button", { name: "Publish rooms" }).click();
  await expect(rooms.getByText(/^Live\./)).toBeVisible({ timeout: 120_000 });

  const board = page.getByRole("region", { name: "Board realm" });
  await board.getByRole("button", { name: "Publish board" }).click();
  await expect(board.getByText(/^Live\./)).toBeVisible({ timeout: 120_000 });

  const roles = page.getByRole("region", { name: "Roles and site settings" });
  await expect(roles.getByText("Admin: you")).toBeVisible({ timeout: 20_000 });
  await expect(roles.getByText("Treasury: you")).toBeVisible();
  await expect(roles.getByText(`NEXT_PUBLIC_GNO_ROOMS_PATH=gno.land/r/${name}/rooms`)).toBeVisible();

  // The chain agrees, and the page sent exactly three transactions: the name and two packages.
  expect(qeval(chain, `gno.land/r/${name}/rooms.Admin()`)).toBe(`("${owner.address}" string)`);
  expect(signed.map((s) => s.messages[0].type)).toEqual(["/vm.m_call", "/vm.m_addpkg", "/vm.m_addpkg"]);
  expect(signed.every((s) => s.ok)).toBe(true);
});
