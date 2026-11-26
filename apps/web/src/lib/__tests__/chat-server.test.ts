import { beforeEach, describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { base64 } from "@scure/base";
import type { Room } from "@/lib/chain/types";
import { ChatFail, issueNonce, MESSAGES_PER_MINUTE, openSession, postMessage, readMessages, sessionAddress, type ChatContext } from "@/lib/chat/server";
import { memoryStore } from "@/lib/chat/store";
import { addressOf, arbitrarySignBytes, type ArbitrarySignature } from "@/lib/chat/verify";

function account() {
  const secret = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(secret, true);
  const address = addressOf(pub);
  const sign = (chainId: string, text: string, as = address): ArbitrarySignature => ({
    pubKey: { typeUrl: "/tm.PubKeySecp256k1", value: base64.encode(pub) },
    signature: base64.encode(secp256k1.sign(arbitrarySignBytes(chainId, as, text), secret)),
  });
  return { address, sign };
}

const maker = account();
const taker = account();
const stranger = account();

function room(id: number, status: Room["status"] = "open", takerAddress = taker.address): Room {
  return {
    id,
    status,
    expired: false,
    version: 1,
    openSeat: false,
    createdAt: 0,
    expiresAt: 4_000_000_000,
    closedAt: 0,
    closedBy: "",
    maker: { address: maker.address, locked: 0, assets: [] },
    taker: { address: takerAddress, locked: 0, assets: [] },
    openMarket: false,
    want: [],
    feeBps: 50,
    now: 0,
  };
}

let ctx: ChatContext;
let clock: number;
const rooms = new Map<number, Room>();

beforeEach(() => {
  clock = Date.UTC(2026, 9, 16, 9);
  rooms.clear();
  rooms.set(1, room(1));
  rooms.set(2, room(2, "settled"));
  rooms.set(3, room(3, "open", ""));
  ctx = { store: memoryStore(), chainId: "onyx-1", roomsPath: "gno.land/r/nym-tradewindow001/rooms", readRoom: async (id) => rooms.get(id) ?? null, now: () => clock };
});

async function signIn(who: ReturnType<typeof account>) {
  const { nonce, text } = await issueNonce(ctx, who.address, "tradewindow.xyz", "1.2.3.4");
  return (await openSession(ctx, nonce, who.sign("onyx-1", text))).token;
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ChatFail) return e.code;
    throw e;
  }
  return "allowed";
};

describe("signing in", () => {
  it("writes a text naming the site, the account, the network and a nonce", async () => {
    const { nonce, text } = await issueNonce(ctx, maker.address, "tradewindow.xyz", "1.2.3.4");
    expect(text).toContain("tradewindow.xyz asks you to sign in to trade chat as");
    expect(text).toContain(maker.address);
    expect(text).toContain("Network: onyx-1");
    expect(text).toContain(`Nonce: ${nonce}`);
    expect(text).toContain("It is not a transaction and costs nothing.");
  });

  it("opens a session for the account that signed", async () => {
    const token = await signIn(maker);
    expect(await sessionAddress(ctx, token)).toBe(maker.address);
  });

  it("uses each sign-in text once", async () => {
    const { nonce, text } = await issueNonce(ctx, maker.address, "tradewindow.xyz", "1.2.3.4");
    await openSession(ctx, nonce, maker.sign("onyx-1", text));
    expect(await refusal(openSession(ctx, nonce, maker.sign("onyx-1", text)))).toBe("signed-out");
  });

  it("refuses a signature by another account, or over other text, or for another network", async () => {
    let n = await issueNonce(ctx, maker.address, "tradewindow.xyz", "1.2.3.4");
    expect(await refusal(openSession(ctx, n.nonce, stranger.sign("onyx-1", n.text)))).toBe("bad-signature");
    n = await issueNonce(ctx, maker.address, "tradewindow.xyz", "1.2.3.4");
    expect(await refusal(openSession(ctx, n.nonce, maker.sign("onyx-1", n.text.replace("tradewindow.xyz", "evil.example"))))).toBe("bad-signature");
    n = await issueNonce(ctx, maker.address, "tradewindow.xyz", "1.2.3.4");
    expect(await refusal(openSession(ctx, n.nonce, maker.sign("gnoland-1", n.text)))).toBe("bad-signature");
  });

  it("lets a sign-in text run out after five minutes", async () => {
    const { nonce, text } = await issueNonce(ctx, maker.address, "tradewindow.xyz", "1.2.3.4");
    const real = Date.now;
    Date.now = () => real() + 5 * 60_000 + 1;
    try {
      expect(await refusal(openSession(ctx, nonce, maker.sign("onyx-1", text)))).toBe("signed-out");
    } finally {
      Date.now = real;
    }
  });

  it("refuses something that is not an address, and an unknown token", async () => {
    expect(await refusal(issueNonce(ctx, "g1notanaddress", "tradewindow.xyz", "1.2.3.4"))).toBe("bad-request");
    expect(await refusal(sessionAddress(ctx, "made-up"))).toBe("signed-out");
    expect(await refusal(sessionAddress(ctx, null))).toBe("signed-out");
  });
});

describe("a room's chat", () => {
  it("carries messages between the two traders, in order", async () => {
    await postMessage(ctx, maker.address, 1, "Would you take 20 for the lantern?");
    await postMessage(ctx, taker.address, 1, "  25, and it is yours.\n");
    const { messages, open } = await readMessages(ctx, taker.address, 1, 0);
    expect(open).toBe(true);
    expect(messages.map((m) => [m.seq, m.from === maker.address ? "maker" : "taker", m.text])).toEqual([
      [1, "maker", "Would you take 20 for the lantern?"],
      [2, "taker", "25, and it is yours."],
    ]);
    expect((await readMessages(ctx, maker.address, 1, 1)).messages.map((m) => m.seq)).toEqual([2]);
  });

  it("is closed to anyone else, and to an open seat nobody took", async () => {
    await postMessage(ctx, maker.address, 1, "hello");
    expect(await refusal(readMessages(ctx, stranger.address, 1, 0))).toBe("forbidden");
    expect(await refusal(postMessage(ctx, stranger.address, 1, "hi"))).toBe("forbidden");
    expect(await refusal(readMessages(ctx, "", 3, 0))).toBe("forbidden");
  });

  it("lets in someone who just took the open seat, even if the room was read before they did", async () => {
    const stale = room(5, "open", "");
    let reads = 0;
    ctx.readRoom = async (id, fresh) => {
      reads++;
      return id === 5 ? (fresh ? room(5) : stale) : (rooms.get(id) ?? null);
    };
    expect(await refusal(postMessage(ctx, taker.address, 5, "I am in"))).toBe("allowed");
    expect(reads).toBe(2);
  });

  it("keeps rooms apart", async () => {
    rooms.set(4, room(4));
    await postMessage(ctx, maker.address, 1, "for room one");
    expect((await readMessages(ctx, maker.address, 4, 0)).messages).toEqual([]);
  });

  it("is read-only once the trade is closed", async () => {
    expect(await refusal(postMessage(ctx, maker.address, 2, "thanks"))).toBe("closed");
    expect((await readMessages(ctx, maker.address, 2, 0)).open).toBe(false);
  });

  it("refuses empty messages and rooms that do not exist", async () => {
    expect(await refusal(postMessage(ctx, maker.address, 1, " \u200b "))).toBe("bad-request");
    expect(await refusal(postMessage(ctx, maker.address, 1, 42))).toBe("bad-request");
    expect(await refusal(readMessages(ctx, maker.address, 99, 0))).toBe("not-found");
    expect(await refusal(readMessages(ctx, maker.address, Number.NaN, 0))).toBe("bad-request");
  });

  it("slows down a flood", async () => {
    for (let i = 0; i < MESSAGES_PER_MINUTE; i++) await postMessage(ctx, maker.address, 1, `m${i}`);
    expect(await refusal(postMessage(ctx, maker.address, 1, "one more"))).toBe("rate");
    clock += 60_000;
    expect(await refusal(postMessage(ctx, maker.address, 1, "a minute later"))).toBe("allowed");
  });
});
