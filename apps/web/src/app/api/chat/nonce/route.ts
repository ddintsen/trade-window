import type { NextRequest } from "next/server";
import { body, clientOf, ok, route } from "@/lib/chat/http";
import { issueNonce } from "@/lib/chat/server";

/** A one-time text for an address to sign with Adena. */
export function POST(request: NextRequest) {
  return route(async (ctx) => {
    const { address } = await body<{ address?: unknown }>(request);
    return ok(await issueNonce(ctx, String(address ?? ""), request.nextUrl.host, clientOf(request)));
  });
}
