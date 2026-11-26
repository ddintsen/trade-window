// Network and realm configuration. Every endpoint is an official gno.land
// one; values come from NEXT_PUBLIC_* variables at build time.

export interface Network {
  chainId: string;
  name: string;
  rpcUrl: string;
  webUrl: string;
}

const NAMES: Record<string, string> = {
  "onyx-1": "Onyx testnet",
  "gnoland-1": "Gno.land mainnet",
  dev: "Local chain",
};

const chainId = process.env.NEXT_PUBLIC_GNO_CHAIN_ID || "onyx-1";

export const network: Network = {
  chainId,
  name: NAMES[chainId] ?? chainId,
  rpcUrl: process.env.NEXT_PUBLIC_GNO_RPC_URL || "https://rpc.onyx.testnets.gno.land:443",
  webUrl: process.env.NEXT_PUBLIC_GNO_WEB_URL || "https://onyx.testnets.gno.land",
};

export const isMainnet = chainId === "gnoland-1";

/** Realm paths. Empty until the realms are deployed on this network. */
export const realms = {
  rooms: process.env.NEXT_PUBLIC_GNO_ROOMS_PATH || "",
  board: process.env.NEXT_PUBLIC_GNO_BOARD_PATH || "",
};

export const roomsDeployed = realms.rooms !== "";
export const boardDeployed = realms.board !== "";

/** Wrapped GNOT, registered in the GRC20 registry on every network. */
export const WUGNOT_KEY = "gno.land/r/gnoland/wugnot.wugnot";
export const WUGNOT_PATH = "gno.land/r/gnoland/wugnot";

export const REPO_URL = "https://github.com/ddintsen/trade-window";

/** gnoweb URL of a realm path, optionally with a Render path. */
export function gnowebUrl(pkgPath: string, renderPath = ""): string {
  const rel = pkgPath.replace(/^gno\.land/, "");
  return `${network.webUrl}${rel}${renderPath ? `:${renderPath}` : ""}`;
}

export function gnowebSourceUrl(pkgPath: string, file?: string): string {
  const rel = pkgPath.replace(/^gno\.land/, "");
  return `${network.webUrl}${rel}$source${file ? `&file=${file}` : ""}`;
}
