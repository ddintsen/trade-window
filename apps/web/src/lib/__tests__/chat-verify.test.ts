import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base64 } from "@scure/base";
import { signInText } from "@/lib/chat/sign-in";
import { cleanText, MAX_TEXT, mergeMessages } from "@/lib/chat/types";
import { addressOf, arbitrarySignBytes, verifyArbitrary, type ArbitrarySignature } from "@/lib/chat/verify";
import fixture from "./fixtures/sign-arbitrary.json";

// The fixture was signed with gno's own JS client (KeySigner,
// sortedJsonStringify, encodeCharacterSet) over Adena's document builder,
// copied verbatim, with a throwaway key: the same path Adena takes.
const sig = fixture.signature as ArbitrarySignature;

describe("sign-in text", () => {
  it("is the text the fixture signed", () => {
    expect(
      signInText({
        domain: "tradewindow.xyz",
        address: fixture.address,
        chainId: "onyx-1",
        nonce: "9f86d081884c7d659a2feaa0c55ad015",
        issuedAt: "2026-10-16T09:00:00.000Z",
      }),
    ).toBe(fixture.data);
  });
});

describe("Adena SignArbitrary verification", () => {
  it("rebuilds the exact bytes Adena signs", () => {
    expect(Buffer.from(arbitrarySignBytes(fixture.chainId, fixture.address, fixture.data)).toString("hex")).toBe(fixture.signBytesHex);
  });

  it("derives the signer's address from the key", () => {
    expect(addressOf(base64.decode(sig.pubKey.value))).toBe(fixture.address);
  });

  it("accepts the signer's own signature", () => {
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data, sig)).toBe(true);
  });

  it("refuses other text, another network or another address", () => {
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data.replace("onyx-1", "gnoland-1"), sig)).toBe(false);
    expect(verifyArbitrary("gnoland-1", fixture.address, fixture.data, sig)).toBe(false);
    expect(verifyArbitrary(fixture.chainId, "g1falmuw7m3u9l80g4ac7aa6vyxj6yjfdvpqqzfx", fixture.data, sig)).toBe(false);
  });

  it("refuses a key that is not the signer's, even with a valid signature by that key", () => {
    const other = secp256k1.utils.randomSecretKey();
    const otherPub = secp256k1.getPublicKey(other, true);
    const signedAs = (signer: string): ArbitrarySignature => ({
      pubKey: { typeUrl: sig.pubKey.typeUrl, value: base64.encode(otherPub) },
      signature: base64.encode(secp256k1.sign(arbitrarySignBytes(fixture.chainId, signer, fixture.data), other)),
    });
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data, signedAs(fixture.address))).toBe(false);
    // The same kind of signature passes for the key's own address: what fails above is the address binding.
    expect(verifyArbitrary(fixture.chainId, addressOf(otherPub), fixture.data, signedAs(addressOf(otherPub)))).toBe(true);
  });

  it("refuses malformed signatures without throwing", () => {
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data, { ...sig, pubKey: { ...sig.pubKey, typeUrl: "/tm.PubKeyEd25519" } })).toBe(false);
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data, { ...sig, signature: "not base64!" })).toBe(false);
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data, { ...sig, signature: base64.encode(new Uint8Array(64)) })).toBe(false);
    expect(verifyArbitrary(fixture.chainId, fixture.address, fixture.data, null as unknown as ArbitrarySignature)).toBe(false);
  });
});

describe("message text", () => {
  it("drops characters that make a message read differently from what it holds", () => {
    expect(cleanText("send \u202e1 GNOT\u202c now")).toBe("send 1 GNOT now");
    expect(cleanText("a\u200bb")).toBe("ab");
  });

  it("keeps one line and trims", () => {
    expect(cleanText("  line one\nline two\t \r\n ")).toBe("line one line two");
  });

  it("caps the length in characters, not bytes", () => {
    expect([...cleanText("ё".repeat(MAX_TEXT + 40))].length).toBe(MAX_TEXT);
  });

  it("merges in order, once each", () => {
    const m = (seq: number) => ({ seq, from: "a", text: String(seq), at: seq });
    expect(mergeMessages([m(1), m(3)], [m(2), m(3), m(4)]).map((x) => x.seq)).toEqual([1, 2, 3, 4]);
  });
});
