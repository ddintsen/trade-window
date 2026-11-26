// Private deal requests go to the Trade Window backend, not to the chain.

export const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
export const requestsEnabled = apiUrl !== "";

export interface DealRequestDraft {
  name: string;
  email: string;
  contactHandle: string;
  preferredContact: string;
  requestType: string;
  chain: string;
  offerAsset: string;
  wantAsset: string;
  amountRange: string;
  message: string;
  requesterWallet?: string;
  consentAccepted: boolean;
}

export interface DealRequestResponse {
  id: string;
  status: string;
}

const REASONS: Record<string, string> = {
  name_required: "Add a name or nickname.",
  email_required: "Add an email address.",
  request_type_required: "Choose what kind of deal this is.",
  offer_asset_required: "Say what you offer.",
  want_asset_required: "Say what you want.",
  chain_required: "Choose the chain.",
  consent_required: "Tick the box to confirm you read the note.",
  invalid_request_type: "Choose one of the listed deal types.",
  invalid_chain: "Choose one of the listed chains.",
  invalid_payload: "The request could not be read. Shorten the message and try again.",
  internal_error: "The server could not store the request. Try again in a minute.",
};

export class RequestError extends Error {
  constructor(
    message: string,
    readonly unknownOutcome = false,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export async function createDealRequest(draft: DealRequestDraft): Promise<DealRequestResponse> {
  if (!requestsEnabled) throw new RequestError("Private requests are not connected on this site yet.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/deal-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
      signal: ctl.signal,
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    throw new RequestError(
      timedOut
        ? "The server did not answer in time, so it is unclear whether the request arrived. If you send it again, it may reach us twice."
        : "The server could not be reached. Check your connection and try again.",
      timedOut,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new RequestError(REASONS[body.error ?? ""] ?? `The server refused the request (${res.status}).`);
  }
  return (await res.json()) as DealRequestResponse;
}
