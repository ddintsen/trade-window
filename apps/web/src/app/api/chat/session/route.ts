import { body, ok, route } from "@/lib/chat/http";
import { openSession } from "@/lib/chat/server";
import type { ArbitrarySignature } from "@/lib/chat/verify";

/** Trades a signed sign-in text for a session token. */
export function POST(request: Request) {
  return route(async (ctx) => {
    const { nonce, signature } = await body<{ nonce?: string; signature?: ArbitrarySignature }>(request);
    return ok(await openSession(ctx, String(nonce ?? ""), signature as ArbitrarySignature));
  });
}
