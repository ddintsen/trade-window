// A stand-in for the Adena extension, for end-to-end tests on a local chain.
// It speaks Adena's injected API (AddEstablish, GetAccount, DoContract, ...)
// and signs with gnokey and a throwaway test key, so the app runs exactly the
// code path it runs with the real wallet: building messages, reading the
// response, and reading the chain afterwards. Never point it at real keys.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base64 } from "@scure/base";
import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { addressOf, arbitraryDoc, arbitrarySignBytes } from "../src/lib/chat/verify";

export interface Chain {
  remote: string;
  chainId: string;
  /** GNOHOME holding the test keys. */
  home: string;
}

export interface Signer {
  key: string;
  address: string;
  /** The account's private key, for off-chain signatures (SignArbitrary). Only accounts made by makeAccount have it. */
  secret?: Uint8Array;
}

export interface StandInOptions {
  /** "commit" answers after the block, like DoContract with commit: true; "sync" answers with the hash only. */
  mode?: "commit" | "sync";
  /** Leave SignArbitrary out, like Adena versions from before it shipped. */
  noSignArbitrary?: boolean;
}

interface Msg {
  type: string;
  value: Record<string, unknown>;
}

const work = mkdtempSync(join(tmpdir(), "tw-adena-"));
let n = 0;

function env(chain: Chain) {
  return { ...process.env, GNOHOME: chain.home, PATH: `${process.env.HOME}/go/bin:${process.env.PATH}` };
}

function gnokey(chain: Chain, args: string[], input?: string): string {
  return execFileSync("gnokey", args, { env: env(chain), input, stdio: ["pipe", "pipe", "pipe"] }).toString();
}

function accountOf(chain: Chain, address: string): { number: string; sequence: string } {
  const out = gnokey(chain, ["query", `auth/accounts/${address}`, "-remote", chain.remote]);
  const json = JSON.parse(out.slice(out.indexOf("data: ") + 6)) as { BaseAccount: { account_number: string; sequence: string } };
  return { number: json.BaseAccount.account_number, sequence: json.BaseAccount.sequence };
}

const b64ToHex = (b64: string) => Buffer.from(b64, "base64").toString("hex");

/** Signs and broadcasts a transaction document; returns gnokey's output or throws it. */
export function signAndBroadcast(chain: Chain, signer: Signer, msgs: Msg[], gasWanted = 60_000_000, gasFee = 200_000, memo = "") {
  const file = join(work, `tx-${process.pid}-${n++}.json`);
  const doc = {
    msg: msgs.map((m) => ({ "@type": m.type, ...m.value })),
    fee: { gas_wanted: String(gasWanted), gas_fee: `${gasFee}ugnot` },
    signatures: null,
    memo,
  };
  writeFileSync(file, JSON.stringify(doc));
  const acc = accountOf(chain, signer.address);
  gnokey(
    chain,
    ["sign", "-tx-path", file, "-chainid", chain.chainId, "-account-number", acc.number, "-account-sequence", acc.sequence, "-insecure-password-stdin", signer.key],
    "\n",
  );
  return gnokey(chain, ["broadcast", file, "-remote", chain.remote]);
}

/** One call outside the app, for test setup. */
export function call(chain: Chain, signer: Signer, pkgPath: string, func: string, args: string[] = [], send = "") {
  return signAndBroadcast(chain, signer, [
    { type: "/vm.m_call", value: { caller: signer.address, send, max_deposit: "", pkg_path: pkgPath, func, args } },
  ]);
}

/** Evaluates an expression in a realm and returns the raw answer, e.g. `(25000000 int64)`. */
export function qeval(chain: Chain, expr: string): string {
  const out = gnokey(chain, ["query", "vm/qeval", "--data", expr, "-remote", chain.remote]);
  return out.slice(out.indexOf("data: ") + 6).trim();
}

export function ugnotOf(chain: Chain, address: string): bigint {
  const out = gnokey(chain, ["query", `bank/balances/${address}`, "-remote", chain.remote]);
  const m = /"(\d+)ugnot"/.exec(out);
  return BigInt(m ? m[1] : "0");
}

/**
 * A fresh account: a new mnemonic recovered into the test GNOHOME under
 * `name`, funded by `funder`, with its private key kept for off-chain
 * signatures. Test chains only.
 */
export function makeAccount(chain: Chain, name: string, funder: Signer, ugnot = 1_000_000_000n): Signer {
  const mnemonic = generateMnemonic(wordlist, 256);
  gnokey(chain, ["add", "--recover", "--insecure-password-stdin", name], `${mnemonic}\n\n\n`);
  const secret = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive("m/44'/118'/0'/0/0").privateKey!;
  const address = addressOf(secp256k1.getPublicKey(secret, true));
  signAndBroadcast(chain, funder, [{ type: "/bank.MsgSend", value: { from_address: funder.address, to_address: address, amount: `${ugnot}ugnot` } }]);
  return { key: name, address, secret };
}

/** What Adena's SignArbitrary returns for a text signed by this account. */
export function signArbitrary(chain: Chain, signer: Signer, data: string) {
  if (!signer.secret) throw new Error(`${signer.key} has no private key here; make it with makeAccount`);
  return {
    signed: arbitraryDoc(chain.chainId, signer.address, data),
    signature: {
      pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: base64.encode(secp256k1.getPublicKey(signer.secret, true)) },
      signature: base64.encode(secp256k1.sign(arbitrarySignBytes(chain.chainId, signer.address, data), signer.secret)),
    },
  };
}

export interface Recorded {
  messages: Msg[];
  ok: boolean;
}

/** Installs the stand-in into every page of the context. Returns the transactions it signs. */
export async function installAdena(context: BrowserContext, chain: Chain, signer: Signer, opts: StandInOptions = {}): Promise<Recorded[]> {
  const log: Recorded[] = [];
  await context.exposeBinding("__adenaBridge", async (_src, method: string, payload: unknown) => {
    switch (method) {
      case "AddEstablish":
      case "SwitchNetwork":
      case "AddNetwork":
        return { code: 0, status: "success", type: "CONNECTION_SUCCESS", message: "", data: {} };
      case "GetAccount":
        return {
          code: 0,
          status: "success",
          type: "GET_ACCOUNT",
          message: "",
          data: { address: signer.address, chainId: chain.chainId, status: "ACTIVE", coins: "" },
        };
      case "DoContract": {
        const p = payload as { messages: Msg[]; memo?: string; gasWanted?: number; gasFee?: number; commit?: boolean };
        try {
          const out = signAndBroadcast(chain, signer, p.messages, Math.max(p.gasWanted ?? 0, 60_000_000), Math.max(p.gasFee ?? 0, 200_000), p.memo);
          log.push({ messages: p.messages, ok: true });
          const returned = out.slice(0, out.indexOf("OK!")).trim();
          const hash = b64ToHex(/TX HASH:\s+(\S+)/.exec(out)?.[1] ?? "");
          const height = /HEIGHT:\s+(\d+)/.exec(out)?.[1] ?? "0";
          if (opts.mode === "sync" || !p.commit) {
            return { code: 0, status: "success", type: "TRANSACTION_SUCCESS", message: "", data: { hash, error: null, data: null, Log: "" } };
          }
          return {
            code: 0,
            status: "success",
            type: "TRANSACTION_SUCCESS",
            message: "",
            data: {
              hash,
              height,
              check_tx: { ResponseBase: { Error: null, Data: null, Log: "" } },
              deliver_tx: { ResponseBase: { Error: null, Data: Buffer.from(`${returned}\n\n`).toString("base64"), Log: "" } },
            },
          };
        } catch (e) {
          const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
          const text = `${err.stdout?.toString() ?? ""}${err.stderr?.toString() ?? ""}` || String(err.message);
          log.push({ messages: p.messages, ok: false });
          return { code: 4001, status: "failure", type: "TRANSACTION_FAILED", message: "TRANSACTION_FAILED", data: { hash: "", error: "transaction failed", log: text } };
        }
      }
      case "SignArbitrary": {
        const p = payload as { signer: string; data: string };
        if (p.signer !== signer.address) return { code: 4002, status: "failure", type: "ACCOUNT_MISMATCH", message: "The account does not match.", data: {} };
        log.push({ messages: [{ type: "sign/MsgSignData", value: { signer: p.signer, data: p.data } }], ok: true });
        return { code: 0, status: "success", type: "SIGN_ARBITRARY", message: "", data: signArbitrary(chain, signer, p.data) };
      }
      default:
        return { code: 4000, status: "failure", type: "UNSUPPORTED_TYPE", message: method, data: {} };
    }
  });
  await context.addInitScript((withSignArbitrary: boolean) => {
    type Bridge = (method: string, payload?: unknown) => Promise<unknown>;
    const bridge = (window as unknown as { __adenaBridge: Bridge }).__adenaBridge;
    (window as unknown as { adena: unknown }).adena = {
      AddEstablish: (name: string) => bridge("AddEstablish", name),
      GetAccount: () => bridge("GetAccount"),
      DoContract: (params: unknown) => bridge("DoContract", params),
      ...(withSignArbitrary ? { SignArbitrary: (params: unknown) => bridge("SignArbitrary", params) } : {}),
      SwitchNetwork: (chainId: string) => bridge("SwitchNetwork", chainId),
      AddNetwork: (params: unknown) => bridge("AddNetwork", params),
      On: () => true,
    };
  }, !opts.noSignArbitrary);
  return log;
}
