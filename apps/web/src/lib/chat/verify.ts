// Checks an Adena SignArbitrary signature. Adena signs an ADR-036 style
// document (message type sign/MsgSignData, which no chain decodes, so it can
// never be broadcast) serialised the way gno signs transactions: keys sorted,
// Go's escaping of <, > and &, then sha256 and secp256k1 over the bytes.
// The address is ripemd160(sha256(compressed key)) in bech32 with prefix g.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64, bech32 } from "@scure/base";
import type { ArbitrarySignature } from "./sign-in";

export type { ArbitrarySignature };
export const SECP256K1_PUBKEY = "/tm.PubKeySecp256k1";

const utf8 = new TextEncoder();

function sorted(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** The document Adena signs: account number, sequence and gas fixed at zero, so it depends only on these three values. */
export function arbitraryDoc(chainId: string, signer: string, data: string) {
  return {
    chain_id: chainId,
    account_number: "0",
    sequence: "0",
    fee: { amount: [], gas: "0" },
    msgs: [{ type: "sign/MsgSignData", value: { signer, data: base64.encode(utf8.encode(data)) } }],
    memo: "",
  };
}

export function arbitrarySignBytes(chainId: string, signer: string, data: string): Uint8Array {
  const json = JSON.stringify(sorted(arbitraryDoc(chainId, signer, data)));
  return utf8.encode(json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"));
}

/** The gno address of a compressed secp256k1 public key. */
export function addressOf(publicKey: Uint8Array): string {
  return bech32.encode("g", bech32.toWords(ripemd160(sha256(publicKey))));
}

/** True only when the signature is signer's own over data on chainId. */
export function verifyArbitrary(chainId: string, signer: string, data: string, sig: ArbitrarySignature): boolean {
  try {
    if (sig?.pubKey?.typeUrl !== SECP256K1_PUBKEY) return false;
    const publicKey = base64.decode(sig.pubKey.value);
    if (publicKey.length !== 33 || addressOf(publicKey) !== signer) return false;
    const signature = base64.decode(sig.signature);
    if (signature.length !== 64) return false;
    const digest = sha256(arbitrarySignBytes(chainId, signer, data));
    // A login is single use (its nonce is spent), so a high-S twin of a signature gains nothing.
    return secp256k1.verify(signature, digest, publicKey, { prehash: false, lowS: false });
  } catch {
    return false;
  }
}
