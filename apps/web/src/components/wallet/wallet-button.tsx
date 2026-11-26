"use client";

import { network } from "@/lib/chain/config";
import { cx } from "@/lib/cx";
import { shortAddress } from "@/lib/format";
import { useWallet, wallet } from "@/lib/wallet/store";
import { buttonClass } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { CopyButton } from "@/components/ui/copy";
import { toast } from "@/components/ui/toast";

export function WalletButton({ block = false }: { block?: boolean }) {
  const w = useWallet();
  const width = block ? "w-full" : "";

  if (!w.installed && w.status !== "connected") {
    return (
      <a href="https://adena.app" target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", width)}>
        Get Adena wallet
      </a>
    );
  }

  if (w.status !== "connected" || !w.account) {
    return (
      <button
        type="button"
        className={buttonClass("primary", "md", width)}
        disabled={w.status === "connecting"}
        onClick={() =>
          wallet.connect().catch((e: Error) => toast("Adena did not connect", { tone: "error", body: e.message }))
        }
      >
        {w.status === "connecting" ? "Waiting for Adena…" : "Connect Adena"}
      </button>
    );
  }

  if (!w.onAppNetwork) {
    return (
      <button
        type="button"
        className={buttonClass("primary", "md", width)}
        onClick={() =>
          wallet.switchNetwork().catch((e: Error) => toast("Adena did not switch", { tone: "error", body: e.message }))
        }
      >
        Switch Adena to {network.name}
      </button>
    );
  }

  const address = w.account.address;
  return (
    <Popover
      label="Wallet"
      triggerClass={cx(buttonClass("secondary", "md", width), "font-mono text-sm")}
      trigger={<span>{shortAddress(address)}</span>}
    >
      {(close) => (
        <div className="flex flex-col gap-1 text-sm">
          <p className="px-2.5 pt-1.5 text-muted">Connected with Adena on {network.name}</p>
          <p className="break-all px-2.5 pb-1 font-mono text-[13px] text-ink">{address}</p>
          <CopyButton text={address} label="Copy address" className={buttonClass("quiet", "sm", "w-full justify-start")} />
          <button
            type="button"
            className={buttonClass("quiet", "sm", "w-full justify-start")}
            onClick={() => {
              wallet.disconnect();
              close();
            }}
          >
            Disconnect from this site
          </button>
        </div>
      )}
    </Popover>
  );
}
