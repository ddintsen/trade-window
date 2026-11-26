"use client";

import { useEffect, useId, useRef, useState } from "react";
import { network } from "@/lib/chain/config";
import { MAX_TEXT, type ChatMessage } from "@/lib/chat/types";
import { useTradeChat } from "@/lib/chat/use-chat";
import { cx } from "@/lib/cx";
import type { VenueKind } from "@/lib/venue/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";

type SideName = "maker" | "taker";

const clock = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/** Consecutive messages from one account share one name line. */
function groups(messages: ChatMessage[]) {
  const out: { from: string; at: number; items: ChatMessage[] }[] = [];
  for (const m of messages) {
    const last = out.at(-1);
    if (last && last.from === m.from && m.at - (last.items.at(-1)?.at ?? 0) < 5 * 60_000) last.items.push(m);
    else out.push({ from: m.from, at: m.at, items: [m] });
  }
  return out;
}

/**
 * The room's chat, under the trade bar: the two traders talk terms here.
 * What is said never changes the deal; the window does.
 */
export function TradeChat({
  kind,
  room,
  me,
  open,
  walletReady,
  nameOf,
  sideOf,
}: {
  kind: VenueKind;
  room: number;
  me: string;
  /** The trade still takes messages. */
  open: boolean;
  /** Adena is connected on this site's network. */
  walletReady: boolean;
  nameOf: (address: string) => string;
  sideOf: (address: string) => SideName | null;
}) {
  const practice = kind === "practice";
  const chat = useTradeChat(kind, room, me, open);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const inputId = useId();
  const section = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const inView = useRef(false);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (inView.current = e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep the newest message in view while the reader is at the bottom, and
  // say when they write while the chat is out of sight.
  const last = chat.messages.at(-1);
  useEffect(() => {
    if (!last) return;
    const el = log.current;
    if (el && (atBottom.current || last.from === me)) el.scrollTop = el.scrollHeight;
    const before = shown.current;
    shown.current = last.seq;
    if (before !== null && last.seq > before && last.from !== me && !inView.current) {
      toast(`${nameOf(last.from)} wrote`, {
        body: last.text.length > 140 ? `${last.text.slice(0, 140)}…` : last.text,
      });
    }
  }, [last, me, nameOf]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await chat.send(text);
    setSending(false);
    if (ok) {
      setDraft("");
      atBottom.current = true;
    }
  }

  let body: React.ReactNode;
  if (chat.phase === "signin") {
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="max-w-[46rem] text-[15px] text-muted">
          Talk terms over before anyone is ready. Signing in asks Adena to sign a message, not a transaction: it costs nothing.
        </p>
        {walletReady ? (
          <Button variant="secondary" busy={chat.signingIn} busyLabel="Confirm in Adena…" onClick={() => void chat.signIn()}>
            Sign in to chat
          </Button>
        ) : (
          <p className="text-[15px] text-frost">Connect Adena on {network.name} to chat.</p>
        )}
      </div>
    );
  } else if (chat.phase === "off") {
    body = <p className="text-[15px] text-muted">{chat.error}</p>;
  } else if (chat.phase === "loading") {
    body = <p className="text-[15px] text-muted">Reading messages…</p>;
  } else {
    body = (
      <>
        <div
          ref={log}
          role="log"
          aria-label="Messages"
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="max-h-80 min-h-24 overflow-y-auto notch well p-4"
        >
          {chat.messages.length === 0 ? (
            <p className="text-[15px] text-muted">
              {open ? "Nothing said yet. Ask what they want, or name what you would take." : "Nothing was said in this trade."}
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {groups(chat.messages).map((g) => {
                const side = sideOf(g.from);
                return (
                  <li key={g.items[0].seq} className="flex flex-col gap-1">
                    <p className="flex items-baseline gap-2.5 text-[13px]">
                      <span className={cx("font-semibold", side === "maker" ? "text-maker" : side === "taker" ? "text-taker" : "text-ink")}>
                        {nameOf(g.from)}
                      </span>
                      <time className="tabular text-muted" dateTime={new Date(g.at).toISOString()}>
                        {clock.format(g.at)}
                      </time>
                    </p>
                    {g.items.map((m) => (
                      <p key={m.seq} className="max-w-[60ch] text-[15px] leading-snug [overflow-wrap:anywhere]">
                        {m.text}
                      </p>
                    ))}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        {open ? (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label htmlFor={inputId} className="sr-only">
              Message
            </label>
            <div className="flex gap-2">
              <Input
                id={inputId}
                value={draft}
                maxLength={MAX_TEXT}
                autoComplete="off"
                enterKeyHint="send"
                placeholder={practice ? "Write to the gnome trader" : "Write to them"}
                onChange={(e) => setDraft(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" className="h-11" busy={sending} busyLabel="Sending…" disabled={!draft.trim()}>
                Send
              </Button>
            </div>
            {draft.length > MAX_TEXT - 100 && (
              <p className="tabular text-[13px] text-muted">
                {draft.length} of {MAX_TEXT} characters
              </p>
            )}
          </form>
        ) : (
          <p className="text-[15px] text-muted">The trade is closed, so the chat is read-only.</p>
        )}
      </>
    );
  }

  return (
    <section ref={section} aria-label="Chat" className="order-4 flex flex-col gap-4 notch notch-lg slab bg-surface p-5 sm:px-6 md:col-span-2 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-pixel text-[2.1rem] leading-none">Chat</h2>
        <p className="text-[13px] text-muted">{practice ? "Practice: the gnome trader answers from a script." : "Kept on this site, not on chain. Only the two of you can open it."}</p>
      </div>
      {body}
      {chat.error && chat.phase !== "off" && (
        <p role="alert" className="text-[14px] text-alert">
          {chat.error}
        </p>
      )}
      <p className="text-[13px] text-muted">Messages are not part of the deal: only what is in the window counts.</p>
    </section>
  );
}
