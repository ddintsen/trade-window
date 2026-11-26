"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { VenueKind } from "@/lib/venue/types";
import { WalletError } from "@/lib/wallet/adena";
import { ChatError, fetchMessages, forgetSession, savedSession, sendMessage, signIn, type ChatSession } from "./client";
import { practiceMessages, practiceMessagesOnServer, sayInPractice, subscribePracticeChat } from "./practice";
import { mergeMessages, type ChatMessage } from "./types";

/** How often an open room's chat is read while the page is in view. */
const POLL_MS = 3000;

export type ChatPhase = "signin" | "loading" | "ready" | "off";

export interface TradeChat {
  phase: ChatPhase;
  messages: ChatMessage[];
  /** Why the chat is off, or what went wrong last. */
  error: string | null;
  signingIn: boolean;
  signIn(): Promise<void>;
  /** Resolves true once the message is stored; false keeps the draft. */
  send(text: string): Promise<boolean>;
}

const NONE: ChatMessage[] = [];

function practiceChat(room: number, open: boolean, messages: ChatMessage[]): TradeChat {
  return {
    phase: "ready",
    messages,
    error: null,
    signingIn: false,
    signIn: async () => {},
    send: async (text) => {
      if (!open) return false;
      sayInPractice(room, text);
      return true;
    },
  };
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The chat of one room for one of its parties. Practice rooms keep it in
 * this browser; rooms on chain read it from this site's chat routes after
 * the party signs in with Adena.
 */
export function useTradeChat(kind: VenueKind, room: number, me: string | null, open: boolean): TradeChat {
  const practice = kind === "practice";
  const local = useSyncExternalStore(subscribePracticeChat, () => (practice ? practiceMessages(room) : NONE), practiceMessagesOnServer);

  // Everything below is keyed by account and room, so a switch of either starts clean.
  const key = `${me ?? ""}:${room}`;
  const [signedIn, setSignedIn] = useState<{ key: string; session: ChatSession | null } | null>(null);
  const session = useMemo(() => {
    if (practice || !me) return null;
    if (signedIn?.key === key) return signedIn.session;
    return savedSession(me);
  }, [practice, me, key, signedIn]);
  const [feed, setFeed] = useState<{ key: string; messages: ChatMessage[]; loaded: boolean }>({ key, messages: NONE, loaded: false });
  const messages = feed.key === key ? feed.messages : NONE;
  const loaded = feed.key === key && feed.loaded;
  const [problem, setProblem] = useState<{ key: string; error: string; off: boolean } | null>(null);
  const error = problem?.key === key ? problem.error : null;
  const off = problem?.key === key && problem.off;
  const [signingIn, setSigningIn] = useState(false);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof ChatError && e.kind === "signed-out" && me) {
        forgetSession(me);
        setSignedIn({ key, session: null });
      }
      const isOff = e instanceof ChatError && (e.kind === "off" || e.kind === "not-live" || e.kind === "forbidden");
      setProblem({ key, error: describe(e), off: isOff });
    },
    [key, me],
  );

  // Read the room's messages: once for a closed trade, every few seconds while it is open and the page is in view.
  useEffect(() => {
    if (practice || !session || off) return;
    let stop = false;
    let after = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible" || after === 0) {
        try {
          const res = await fetchMessages(session, room, after, ctrl.signal);
          if (stop) return;
          if (res.messages.length) after = res.messages.at(-1)!.seq;
          setFeed((f) => ({ key, messages: mergeMessages(f.key === key ? f.messages : NONE, res.messages), loaded: true }));
          setProblem((p) => (p?.key === key && !p.off ? null : p));
          if (!res.open) return;
        } catch (e) {
          if (stop || ctrl.signal.aborted) return;
          handle(e);
          if (e instanceof ChatError && (e.kind === "signed-out" || e.kind === "off" || e.kind === "not-live" || e.kind === "forbidden")) return;
        }
      }
      timer = setTimeout(tick, open ? POLL_MS : POLL_MS * 5);
    };
    void tick();
    const wake = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      ctrl.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [practice, session, off, room, key, open, handle]);

  const doSignIn = useCallback(async () => {
    if (!me) return;
    setSigningIn(true);
    setProblem(null);
    try {
      const s = await signIn(me);
      setSignedIn({ key, session: s });
    } catch (e) {
      if (e instanceof WalletError && e.kind === "rejected") setProblem({ key, error: "You cancelled the signature. Sign in when you want to chat.", off: false });
      else handle(e);
    } finally {
      setSigningIn(false);
    }
  }, [me, key, handle]);

  const send = useCallback(
    async (text: string) => {
      if (!session) return false;
      try {
        const m = await sendMessage(session, room, text);
        setFeed((f) => ({ key, messages: mergeMessages(f.key === key ? f.messages : NONE, [m]), loaded: true }));
        setProblem(null);
        return true;
      } catch (e) {
        handle(e);
        return false;
      }
    },
    [session, room, key, handle],
  );

  if (practice) return practiceChat(room, open, local);
  return {
    phase: off ? "off" : !session ? "signin" : loaded ? "ready" : "loading",
    messages,
    error,
    signingIn,
    signIn: doSignIn,
    send,
  };
}
