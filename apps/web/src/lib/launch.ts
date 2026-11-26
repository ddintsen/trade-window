// Putting the realms on a network from the owner's own wallet: the deployer
// becomes the rooms admin and treasury, so nothing has to be handed over and
// no other key is involved. Used by the /launch page.

import { network } from "@/lib/chain/config";
import { addPackage, call, type TxMessage } from "@/lib/chain/messages";
import { REALM_FILES, type RealmName } from "@/lib/chain/realm-source";
import { abciQuery, ChainError, qevalString } from "@/lib/chain/rpc";

export const NAME_REGISTRY = "gno.land/r/sys/namereg/v0";
export const USERS = "gno.land/r/sys/users";
export const SUGGESTED_NAME = "nym-tradewindow001";

/** The registry's format: nym-, 5 to 13 lowercase letters, 3 digits. */
const NAME_FORMAT = /^nym-[a-z]{5,13}\d{3}$/;

/** Why a name cannot be registered, or null when its format is fine (the registry has the last word). */
export function nameProblem(name: string): string | null {
  if (!NAME_FORMAT.test(name)) return "Use nym-, then 5 to 13 lowercase letters, then 3 digits, like nym-tradewindow001.";
  const stem = name.slice(4).replace(/\d+$/, "");
  if (/^(gno|gi|gl)/.test(stem)) return "The letters cannot start with gno, gi or gl.";
  return null;
}

export const REALMS: RealmName[] = ["rooms", "board"];

/** Where a realm lands under a namespace: the owner's name, or their address. */
export function realmPath(namespace: string, realm: RealmName): string {
  return `gno.land/r/${namespace}/${realm}`;
}

/**
 * Storage deposit ceiling and gas for each deploy. Measured on a local chain
 * with gno.land's parameters: rooms locks about 5.2 GNOT and board 2.5 GNOT;
 * the gas limits leave room above what the deploys used.
 */
export const DEPLOY: Record<RealmName, { maxDeposit: string; gasWanted: number }> = {
  rooms: { maxDeposit: "10000000ugnot", gasWanted: 200_000_000 },
  board: { maxDeposit: "5000000ugnot", gasWanted: 100_000_000 },
};

export function deployMessage(creator: string, namespace: string, realm: RealmName): TxMessage {
  return addPackage(creator, realmPath(namespace, realm), REALM_FILES[realm], DEPLOY[realm].maxDeposit);
}

export function registerNameMessage(caller: string, name: string): TxMessage {
  return call(caller, NAME_REGISTRY, "Register", [name]);
}

/** The registered name of an address, or null. */
export async function nameOf(address: string): Promise<string | null> {
  const found = await abciQuery("vm/qeval", `${USERS}.ResolveAddress(address("${address}"))`);
  if (/\(nil \*/.test(found)) return null;
  return qevalString(USERS, `ResolveAddress(address("${address}")).Name()`);
}

/** True once a realm answers on this network; false while it is not there yet (or still parked for review). */
export async function isLive(path: string): Promise<boolean> {
  try {
    await abciQuery("vm/qeval", `${path}.Render("")`);
    return true;
  } catch (e) {
    if (e instanceof ChainError && e.kind !== "network") return false;
    throw e;
  }
}

/** The rooms realm's admin and treasury, read from the chain. */
export async function roles(roomsPath: string): Promise<{ admin: string; treasury: string }> {
  const [admin, treasury] = await Promise.all([qevalString(roomsPath, "Admin()"), qevalString(roomsPath, "Treasury()")]);
  return { admin, treasury };
}

/** The site's settings for this network, in the form Vercel and .env files take. */
export function siteSettings(namespace: string): string {
  return [
    `NEXT_PUBLIC_GNO_CHAIN_ID=${network.chainId}`,
    `NEXT_PUBLIC_GNO_RPC_URL=${network.rpcUrl}`,
    `NEXT_PUBLIC_GNO_WEB_URL=${network.webUrl}`,
    `NEXT_PUBLIC_GNO_ROOMS_PATH=${realmPath(namespace, "rooms")}`,
    `NEXT_PUBLIC_GNO_BOARD_PATH=${realmPath(namespace, "board")}`,
  ].join("\n");
}
