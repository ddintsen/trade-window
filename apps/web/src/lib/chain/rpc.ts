// Read-only access to a Gno.land node over JSON-RPC (abci_query). The
// browser talks to the official RPC endpoint directly; nodes answer CORS
// requests from any origin by default.

import { network } from "./config";

export type ChainErrorKind = "network" | "not-deployed" | "query" | "parse";

export class ChainError extends Error {
  constructor(
    message: string,
    public kind: ChainErrorKind,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

interface AbciResponse {
  result?: {
    response?: {
      ResponseBase?: {
        Error: unknown;
        Data: string | null;
        Log: string;
      };
    };
  };
  error?: { message?: string; data?: string };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * The words a person needs from a chain error log: the realm's panic message
 * when there is one, otherwise the error the node names.
 */
export function errorSummary(log: string): string {
  const lines = log.split("\n").map((l) => l.trim());
  for (const l of lines) {
    const m = /VM panic:\s*(.+)$/.exec(l);
    if (m) return m[1].trim();
  }
  const stack = lines.find((l) => l.startsWith("panic: "));
  if (stack) return stack.slice(7).trim();
  // A trace line names the error: "0  gno/.../errors.go:88 - package not found: ..."
  for (const l of lines) {
    const m = /errors\.go:\d+ - (.+)$/.exec(l);
    if (m && !/^deliver transaction failed|^check transaction failed/.test(m[1])) return m[1].trim();
  }
  const data = lines.find((l) => l.startsWith("Data: ") && !/[{}]/.test(l));
  if (data) return data.slice(6).trim();
  return lines.find((l) => l && !l.startsWith("--=")) ?? "unknown error";
}

export async function abciQuery(path: string, data = "", signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(network.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "abci_query",
        params: { path, data: data ? toBase64(data) : "" },
      }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ChainError(`Cannot reach ${network.name}`, "network");
  }
  if (!res.ok) throw new ChainError(`${network.name} answered ${res.status}`, "network");
  const body = (await res.json()) as AbciResponse;
  if (body.error) throw new ChainError(body.error.data || body.error.message || "query failed", "query");
  const base = body.result?.response?.ResponseBase;
  if (!base) throw new ChainError("Empty answer from the node", "parse");
  if (base.Error) {
    const summary = errorSummary(base.Log || "");
    const kind = /package not found|invalid package path/i.test(base.Log) ? "not-deployed" : "query";
    throw new ChainError(summary, kind);
  }
  return base.Data ? fromBase64(base.Data) : "";
}

export interface TxOutcome {
  height: number;
  ok: boolean;
  /** What the VM returned, e.g. "(12 uint64)", when ok. */
  data: string;
  /** The chain's log, which carries the reason when not ok. */
  log: string;
}

function hashToBase64(hash: string): string {
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(hash)) {
    const hex = hash.replace(/^0x/, "");
    let bin = "";
    for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    return btoa(bin);
  }
  return hash;
}

/**
 * The result of a transaction that made it into a block, or null while it
 * has not (yet). Uses the node's own tx index, keyed by hash.
 */
export async function txOutcome(hash: string, signal?: AbortSignal): Promise<TxOutcome | null> {
  let res: Response;
  try {
    res = await fetch(network.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tx", params: { hash: hashToBase64(hash) } }),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ChainError(`Cannot reach ${network.name}`, "network");
  }
  if (!res.ok) throw new ChainError(`${network.name} answered ${res.status}`, "network");
  const body = (await res.json()) as {
    result?: { height?: string; tx_result?: { ResponseBase?: { Error: unknown; Data: string | null; Log: string } } };
    error?: unknown;
  };
  const base = body.result?.tx_result?.ResponseBase;
  if (body.error || !base) return null;
  return {
    height: Number(body.result?.height ?? 0),
    ok: !base.Error,
    data: base.Data ? fromBase64(base.Data) : "",
    log: base.Log ?? "",
  };
}

/**
 * Parses the qeval rendering of one return value, e.g. `("text" string)`,
 * `(42 int64)` or `(true bool)`, into the raw literal and its type.
 */
export function parseTypedValue(out: string): { literal: string; type: string } {
  const text = out.trim();
  const m = /^\(([\s\S]*) ([^\s()]+)\)$/.exec(text);
  if (!m) throw new ChainError(`Unexpected answer: ${text.slice(0, 80)}`, "parse");
  return { literal: m[1], type: m[2] };
}

/** Decodes a Go string literal as printed by the Gno VM. */
export function unquoteGo(literal: string): string {
  if (literal.length < 2 || literal[0] !== '"' || literal[literal.length - 1] !== '"') {
    throw new ChainError("Expected a string literal", "parse");
  }
  const body = literal.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[++i];
    switch (n) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case "a": out += "\x07"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case "v": out += "\v"; break;
      case "\\": out += "\\"; break;
      case '"': out += '"'; break;
      case "'": out += "'"; break;
      case "x": out += String.fromCharCode(parseInt(body.substr(i + 1, 2), 16)); i += 2; break;
      case "u": out += String.fromCodePoint(parseInt(body.substr(i + 1, 4), 16)); i += 4; break;
      case "U": out += String.fromCodePoint(parseInt(body.substr(i + 1, 8), 16)); i += 8; break;
      default:
        if (n >= "0" && n <= "7") {
          out += String.fromCharCode(parseInt(body.substr(i, 3), 8));
          i += 2;
        } else {
          throw new ChainError(`Bad escape \\${n}`, "parse");
        }
    }
  }
  return out;
}

/** Evaluates a read-only expression in a realm and returns its string result. */
export async function qevalString(pkgPath: string, expr: string, signal?: AbortSignal): Promise<string> {
  const out = await abciQuery("vm/qeval", `${pkgPath}.${expr}`, signal);
  const { literal, type } = parseTypedValue(out);
  if (type !== "string") throw new ChainError(`Expected a string, got ${type}`, "parse");
  return unquoteGo(literal);
}

/** Evaluates an expression that returns a JSON document as a string. */
export async function qevalJSON<T>(pkgPath: string, expr: string, signal?: AbortSignal): Promise<T> {
  const text = await qevalString(pkgPath, expr, signal);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ChainError("The realm returned invalid JSON", "parse");
  }
}

/** A Go string literal for use inside a qeval expression. */
export function goString(s: string): string {
  return JSON.stringify(s);
}

/** Native coin balances of an address, as base-unit strings by denom. */
export async function coinBalances(address: string, signal?: AbortSignal): Promise<Record<string, string>> {
  const out = await abciQuery(`bank/balances/${address}`, "", signal);
  const text = out ? (JSON.parse(out) as string) : "";
  const result: Record<string, string> = {};
  for (const part of text.split(",")) {
    const m = /^(\d+)(.+)$/.exec(part.trim());
    if (m) result[m[2]] = m[1];
  }
  return result;
}

/** The chain's current minimum gas price, as ugnot per `gas` units. */
export async function gasPrice(signal?: AbortSignal): Promise<{ gas: bigint; ugnot: bigint }> {
  const out = await abciQuery("auth/gasprice", "", signal);
  const parsed = JSON.parse(out) as { gas: string; price: string };
  const m = /^(\d+)ugnot$/.exec(parsed.price);
  return { gas: BigInt(parsed.gas || "1000"), ugnot: BigInt(m ? m[1] : "1") };
}
