// Adena, the Gno.land wallet extension. Only the calls this app needs.

import { network } from "@/lib/chain/config";
import type { CallMessage, TxMessage } from "@/lib/chain/messages";
import { errorSummary, txOutcome } from "@/lib/chain/rpc";
import type { ArbitrarySignature } from "@/lib/chat/sign-in";

interface AdenaResult<D = unknown> {
  code?: number;
  status?: "success" | "failure";
  type?: string;
  message?: string;
  data?: D;
}

interface AccountData {
  address?: string;
  chainId?: string;
  status?: string;
}

interface ResponseBase {
  Error?: unknown;
  Data?: string | null;
  Log?: string;
}

interface CommitData {
  hash?: string;
  height?: string;
  check_tx?: { ResponseBase?: ResponseBase };
  deliver_tx?: { ResponseBase?: ResponseBase };
}

interface FailureData {
  error?: string | { message?: string } | null;
  /** The chain's diagnostic log, sent by newer Adena versions. */
  log?: string;
}

export interface AdenaProvider {
  AddEstablish(name: string): Promise<AdenaResult>;
  GetAccount(): Promise<AdenaResult<AccountData> & AccountData>;
  DoContract(params: {
    messages: TxMessage[];
    memo?: string;
    gasFee?: number;
    gasWanted?: number;
    /** Wait for the block (broadcast_tx_commit). Without it Adena only waits for CheckTx. */
    commit?: boolean;
  }): Promise<AdenaResult<CommitData & FailureData>>;
  /** Signs text off chain (ADR-036, never broadcastable). Missing in Adena versions before it shipped. */
  SignArbitrary?(params: { signer: string; data: string }): Promise<AdenaResult<{ signature?: ArbitrarySignature }>>;
  AddNetwork?(params: { chainId: string; chainName: string; rpcUrl: string }): Promise<AdenaResult>;
  SwitchNetwork?(chainId: string): Promise<AdenaResult>;
  On?(event: "changedAccount" | "changedNetwork", cb: (value: string) => void): boolean;
}

declare global {
  interface Window {
    adena?: AdenaProvider;
  }
}

export class WalletError extends Error {
  constructor(
    message: string,
    public kind: "missing" | "rejected" | "locked" | "network" | "failed" | "unknown-outcome" | "unsupported",
  ) {
    super(message);
    this.name = "WalletError";
  }
}

export function adenaProvider(): AdenaProvider | null {
  if (typeof window === "undefined") return null;
  return window.adena ?? null;
}

export interface WalletAccount {
  address: string;
  chainId: string;
}

function unwrapAccount(res: AdenaResult<AccountData> & AccountData): AccountData {
  return res.data ?? res;
}

/** Asks Adena for access and returns the active account. */
export async function connectAdena(): Promise<WalletAccount> {
  const adena = adenaProvider();
  if (!adena) throw new WalletError("Adena is not installed in this browser.", "missing");
  const est = await adena.AddEstablish("Trade Window");
  if (est?.status === "failure" && est.type !== "ALREADY_CONNECTED") {
    if (est.type === "WALLET_LOCKED") throw new WalletError("Unlock Adena, then connect again.", "locked");
    throw new WalletError(est.message || "Adena did not allow the connection.", "rejected");
  }
  return readAccount();
}

export async function readAccount(): Promise<WalletAccount> {
  const adena = adenaProvider();
  if (!adena) throw new WalletError("Adena is not installed in this browser.", "missing");
  const res = await adena.GetAccount();
  if (res?.status === "failure") {
    if (res.type === "WALLET_LOCKED") throw new WalletError("Unlock Adena, then connect again.", "locked");
    throw new WalletError(res.message || "Adena did not return an account.", "rejected");
  }
  const acc = unwrapAccount(res);
  if (!acc.address) throw new WalletError("Adena did not return an address. Unlock it and pick an account.", "locked");
  return { address: acc.address, chainId: acc.chainId ?? "" };
}

/** Moves Adena to this app's network, adding the network first if needed. */
export async function switchToAppNetwork(): Promise<void> {
  const adena = adenaProvider();
  if (!adena?.SwitchNetwork) throw new WalletError(`Switch Adena to ${network.name} (${network.chainId}).`, "network");
  let res = await adena.SwitchNetwork(network.chainId);
  if (res?.status === "failure" && res.type === "UNADDED_NETWORK" && adena.AddNetwork) {
    const added = await adena.AddNetwork({
      chainId: network.chainId,
      chainName: network.name,
      rpcUrl: network.rpcUrl,
    });
    if (added?.status === "failure") throw new WalletError(added.message || "Adena did not add the network.", "network");
    res = await adena.SwitchNetwork(network.chainId);
  }
  if (res?.status === "failure" && res.type !== "REDUNDANT_CHANGE_REQUEST") {
    throw new WalletError(res.message || `Adena stayed on another network.`, "network");
  }
}

export interface TxReceipt {
  hash: string;
  height: number;
  /** The return value printed by the VM, e.g. "(12 uint64)". */
  returned: string;
}

function decodeBase64(b64: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Adena answers before the block when it broadcasts in sync mode: then the
 * transaction is looked up by hash until a block holds it.
 */
async function waitForBlock(hash: string): Promise<TxReceipt> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await sleep(1200);
    const out = await txOutcome(hash).catch(() => null);
    if (out) {
      if (!out.ok) throw new WalletError(errorSummary(out.log), "failed");
      return { hash, height: out.height, returned: out.data };
    }
  }
  throw new WalletError("The transaction was sent but is not in a block yet.", "unknown-outcome");
}

/**
 * Signs and broadcasts call messages through Adena. Resolves only for a
 * transaction the chain executed; any failure carries the chain's reason.
 */
export async function sendCalls(messages: CallMessage[], memo = ""): Promise<TxReceipt> {
  return sendMessages(messages, memo, Math.min(10_000_000 * messages.length + 20_000_000, 100_000_000));
}

/**
 * Signs and broadcasts any messages through Adena with the given gas limit;
 * the fee pays 0.002 ugnot a unit, twice the chain's minimum price.
 */
export async function sendMessages(messages: TxMessage[], memo: string, gasWanted: number): Promise<TxReceipt> {
  const adena = adenaProvider();
  if (!adena) throw new WalletError("Adena is not installed in this browser.", "missing");
  let res: AdenaResult<CommitData & FailureData>;
  try {
    res = await adena.DoContract({ messages, memo, gasWanted, gasFee: Math.ceil(gasWanted / 500), commit: true });
  } catch (e) {
    throw new WalletError(e instanceof Error ? e.message : "Adena stopped responding.", "unknown-outcome");
  }
  if (res?.status !== "success") {
    if (res?.type === "TRANSACTION_REJECTED") throw new WalletError("You cancelled the transaction in Adena.", "rejected");
    if (res?.type === "WALLET_LOCKED") throw new WalletError("Unlock Adena and try again.", "locked");
    if (res?.type === "NETWORK_TIMEOUT") {
      throw new WalletError("The network did not answer in time. Check the room before trying again.", "unknown-outcome");
    }
    const err = res?.data?.error;
    const raw = res?.data?.log || (typeof err === "string" ? err : err?.message);
    throw new WalletError(raw ? errorSummary(raw) : res?.message || "The transaction failed.", "failed");
  }
  const data = res.data ?? {};
  if (!data.deliver_tx && !data.check_tx) {
    if (!data.hash) throw new WalletError("Adena did not say what happened to the transaction.", "unknown-outcome");
    return waitForBlock(data.hash);
  }
  const failure = data.check_tx?.ResponseBase?.Error ? data.check_tx : data.deliver_tx?.ResponseBase?.Error ? data.deliver_tx : null;
  if (failure) throw new WalletError(errorSummary(failure.ResponseBase?.Log ?? ""), "failed");
  const returned = data.deliver_tx?.ResponseBase?.Data ? decodeBase64(data.deliver_tx.ResponseBase.Data) : "";
  return { hash: data.hash ?? "", height: Number(data.height ?? 0), returned };
}

/**
 * Has Adena sign a text as the given account, off chain: nothing is sent to
 * the network and nothing is paid. Used to sign in to trade chat.
 */
export async function signText(signer: string, data: string): Promise<ArbitrarySignature> {
  const adena = adenaProvider();
  if (!adena) throw new WalletError("Adena is not installed in this browser.", "missing");
  if (!adena.SignArbitrary) throw new WalletError("This Adena cannot sign messages yet. Update Adena, then sign in again.", "unsupported");
  const res = await adena.SignArbitrary({ signer, data });
  if (res?.status !== "success" || !res.data?.signature) {
    if (res?.type === "SIGN_REJECTED") throw new WalletError("You cancelled the signature in Adena.", "rejected");
    if (res?.type === "WALLET_LOCKED") throw new WalletError("Unlock Adena and try again.", "locked");
    if (res?.type === "ACCOUNT_MISMATCH") throw new WalletError("Adena is on another account. Switch back to the one in this trade.", "failed");
    throw new WalletError(res?.message || "Adena did not sign.", "failed");
  }
  return res.data.signature;
}
