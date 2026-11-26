import type { NextRequest } from "next/server";
import { bearer, body, ok, route } from "@/lib/chat/http";
import { postMessage, readMessages, sessionAddress } from "@/lib/chat/server";

const roomId = (raw: string) => (/^\d{1,15}$/.test(raw) ? Number(raw) : NaN);

/** The room's messages after ?after=seq, for one of its two parties. */
export function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async (chat) => {
    const address = await sessionAddress(chat, bearer(request));
    const after = Number(request.nextUrl.searchParams.get("after") ?? "0");
    return ok(await readMessages(chat, address, roomId((await ctx.params).id), Number.isFinite(after) ? after : 0));
  });
}

/** Adds a message from one of the room's two parties while the trade is open. */
export function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return route(async (chat) => {
    const address = await sessionAddress(chat, bearer(request));
    const { text } = await body<{ text?: unknown }>(request);
    return ok({ message: await postMessage(chat, address, roomId((await ctx.params).id), text) });
  });
}
