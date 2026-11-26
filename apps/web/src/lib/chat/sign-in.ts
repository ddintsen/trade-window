// Signing in to trade chat: the server writes this text, Adena signs it
// (SignArbitrary, which cannot be broadcast as a transaction), and the
// server checks the signature over exactly the text it wrote.

export interface SignIn {
  /** The site's host, e.g. tradewindow.xyz. */
  domain: string;
  address: string;
  chainId: string;
  nonce: string;
  /** ISO time the server wrote the text. */
  issuedAt: string;
}

export function signInText(s: SignIn): string {
  return [
    `${s.domain} asks you to sign in to trade chat as`,
    s.address,
    "",
    "Signing proves this account is yours. It is not a transaction and costs nothing.",
    "",
    `Network: ${s.chainId}`,
    `Nonce: ${s.nonce}`,
    `Issued: ${s.issuedAt}`,
  ].join("\n");
}

/** A gno address: g1 and 38 bech32 characters. */
export const ADDRESS = /^g1[02-9ac-hj-np-z]{38}$/;

/** What Adena's SignArbitrary returns: the compressed public key and a 64-byte signature, both base64. */
export interface ArbitrarySignature {
  pubKey: { typeUrl: string; value: string };
  signature: string;
}
