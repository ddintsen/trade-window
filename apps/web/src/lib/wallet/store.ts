"use client";

// One shared wallet state for the whole app.

import { useSyncExternalStore } from "react";
import { network } from "@/lib/chain/config";
import { adenaProvider, connectAdena, readAccount, switchToAppNetwork, WalletError, type WalletAccount } from "./adena";

export interface WalletState {
  installed: boolean;
  status: "idle" | "connecting" | "connected";
  account: WalletAccount | null;
  error: string | null;
}

const REMEMBER = "tw.wallet.connected";

let state: WalletState = { installed: false, status: "idle", account: null, error: null };
const listeners = new Set<() => void>();

function set(next: Partial<WalletState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function remember(on: boolean) {
  try {
    if (on) localStorage.setItem(REMEMBER, "1");
    else localStorage.removeItem(REMEMBER);
  } catch {
    // storage can be unavailable; the wallet still works for this visit
  }
}

function remembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER) === "1";
  } catch {
    return false;
  }
}

let started = false;

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // Extensions inject after first paint; look again for a few seconds and on focus.
  const detect = () => {
    const has = adenaProvider() !== null;
    if (has !== state.installed) set({ installed: has });
    return has;
  };
  let tries = 0;
  const timer = window.setInterval(() => {
    tries++;
    if (detect() || tries > 20) {
      window.clearInterval(timer);
      if (state.installed) attach();
    }
  }, 250);
  window.addEventListener("focus", detect);
}

let attached = false;

function attach() {
  const adena = adenaProvider();
  if (!adena || attached) return;
  attached = true;
  const refresh = () => {
    if (state.status !== "connected") return;
    readAccount()
      .then((account) => set({ account, error: null }))
      .catch(() => set({ status: "idle", account: null }));
  };
  adena.On?.("changedAccount", refresh);
  adena.On?.("changedNetwork", refresh);
  if (remembered()) {
    readAccount()
      .then((account) => set({ status: "connected", account, error: null }))
      .catch(() => remember(false));
  }
}

export const wallet = {
  async connect() {
    set({ status: "connecting", error: null });
    try {
      const account = await connectAdena();
      set({ status: "connected", account, error: null, installed: true });
      remember(true);
      attach();
      return account;
    } catch (e) {
      set({ status: "idle", account: null, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  disconnect() {
    remember(false);
    set({ status: "idle", account: null, error: null });
  },
  async switchNetwork() {
    try {
      await switchToAppNetwork();
      const account = await readAccount();
      set({ account, error: null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  clearError() {
    set({ error: null });
  },
  snapshot: () => state,
};

const subscribe = (l: () => void) => {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
};

const serverState: WalletState = { installed: false, status: "idle", account: null, error: null };

export function useWallet(): WalletState & { onAppNetwork: boolean } {
  const s = useSyncExternalStore(subscribe, () => state, () => serverState);
  const onAppNetwork = !!s.account && (s.account.chainId === "" || s.account.chainId === network.chainId);
  return { ...s, onAppNetwork };
}

export { WalletError };
