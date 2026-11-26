"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BOARD_LIMITS, boardTextProblem, boardTx, textLength } from "@/lib/chain/board";
import { boardDeployed, network } from "@/lib/chain/config";
import type { ListingSide } from "@/lib/chain/types";
import { sendCalls, WalletError } from "@/lib/wallet/adena";
import { useWallet } from "@/lib/wallet/store";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Segmented, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { WalletButton } from "@/components/wallet/wallet-button";

const DAYS = [1, 3, 7, 14, 30];

const GUIDE: Record<ListingSide, { give: string; want: string }> = {
  buy: { give: "What you pay, like 500 GNOT", want: "What you are buying" },
  sell: { give: "What you are selling", want: "What you want for it, like 500 GNOT" },
  swap: { give: "What you give", want: "What you want in exchange" },
};

export function PostForm() {
  const router = useRouter();
  const w = useWallet();
  const ready = w.status === "connected" && !!w.account && w.onAppNetwork;
  const [side, setSide] = useState<ListingSide>("sell");
  const [give, setGive] = useState("");
  const [want, setWant] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!boardDeployed) {
    return (
      <div className="flex flex-col items-start gap-4 notch notch-lg slab bg-surface p-6">
        <p className="text-[15px] text-muted">The board is not live on {network.name} yet, so nothing can be posted.</p>
        <LinkButton href="/practice" variant="secondary">
          Try a practice room
        </LinkButton>
      </div>
    );
  }

  const errors = {
    give: boardTextProblem(give, BOARD_LIMITS.give, true),
    want: boardTextProblem(want, BOARD_LIMITS.want, true),
    note: boardTextProblem(note, BOARD_LIMITS.note, false),
  };
  const invalid = !!(errors.give || errors.want || errors.note);

  return (
    <form
      noValidate
      className="flex flex-col gap-6 notch notch-lg slab bg-surface p-5 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        setFailure(null);
        if (invalid || !ready || !w.account) return;
        setBusy(true);
        try {
          await sendCalls(boardTx.post(w.account.address, side, give.trim(), want.trim(), note.trim(), days));
          toast("Listing posted", { tone: "done", body: `It stays up for ${days === 1 ? "1 day" : `${days} days`} unless you close it.` });
          router.push("/board");
        } catch (err) {
          if (err instanceof WalletError && err.kind === "rejected") toast("Cancelled in Adena");
          else setFailure(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">You are</span>
        <Segmented
          label="You are"
          value={side}
          onChange={setSide}
          options={[
            { value: "sell", label: "Selling" },
            { value: "buy", label: "Buying" },
            { value: "swap", label: "Swapping" },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="You give"
          error={tried || textLength(give) > BOARD_LIMITS.give ? errors.give : null}
          hint={`${GUIDE[side].give}. ${textLength(give)} of ${BOARD_LIMITS.give}.`}
        >
          {({ id, describedBy, invalid: bad }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={bad} value={give} onChange={(e) => setGive(e.target.value)} autoComplete="off" />
          )}
        </Field>
        <Field
          label="You want"
          error={tried || textLength(want) > BOARD_LIMITS.want ? errors.want : null}
          hint={`${GUIDE[side].want}. ${textLength(want)} of ${BOARD_LIMITS.want}.`}
        >
          {({ id, describedBy, invalid: bad }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={bad} value={want} onChange={(e) => setWant(e.target.value)} autoComplete="off" />
          )}
        </Field>
      </div>

      <Field
        label="Note, optional"
        error={tried || textLength(note) > BOARD_LIMITS.note ? errors.note : null}
        hint={`Terms, partial fills, timing. No contact details: everything here is public for good. ${textLength(note)} of ${BOARD_LIMITS.note}.`}
      >
        {({ id, describedBy, invalid: bad }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={bad}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value.replace(/[\r\n]+/g, " "))}
          />
        )}
      </Field>

      <Field label="Keep it up for">
        {({ id }) => (
          <Select id={id} value={days} onChange={(e) => setDays(Number(e.target.value))} className="sm:max-w-60">
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 day" : `${d} days`}
              </option>
            ))}
          </Select>
        )}
      </Field>

      {failure && (
        <p role="alert" className="notch bg-alert-bg px-4 py-3 text-[15px] text-alert">
          The listing was not posted: {failure}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {ready ? (
          <Button type="submit" variant="primary" busy={busy} busyLabel="Confirm in Adena…">
            Post listing
          </Button>
        ) : (
          <WalletButton />
        )}
        <p className="text-[13px] text-muted">One account can keep {BOARD_LIMITS.active} listings open at a time. Posting needs a little GNOT for the network fee and storage deposit.</p>
      </div>
    </form>
  );
}
