"use client";

import { useState } from "react";
import { createDealRequest, RequestError, requestsEnabled, type DealRequestDraft } from "@/lib/request/api";
import { useWallet } from "@/lib/wallet/store";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const TYPES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
  { value: "swap", label: "Swap" },
  { value: "otc_bundle", label: "A bundle of several assets" },
  { value: "nft_game_rwa", label: "NFT, game asset or real-world asset" },
  { value: "other", label: "Something else" },
];

const CHAINS = [
  { value: "gno", label: "Gno.land" },
  { value: "atomone", label: "AtomOne" },
  { value: "cosmos_ibc", label: "Cosmos or IBC" },
  { value: "other", label: "Another chain" },
];

const CONTACTS = [
  { value: "email", label: "Email" },
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "x", label: "X" },
];

type Draft = Omit<DealRequestDraft, "requesterWallet" | "consentAccepted">;

const EMPTY: Draft = {
  name: "",
  email: "",
  contactHandle: "",
  preferredContact: "email",
  requestType: "",
  chain: "gno",
  offerAsset: "",
  wantAsset: "",
  amountRange: "",
  message: "",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function problems(d: Draft, consent: boolean): Partial<Record<keyof Draft | "consent", string>> {
  const p: Partial<Record<keyof Draft | "consent", string>> = {};
  if (!d.name.trim()) p.name = "Add a name or nickname";
  if (!EMAIL.test(d.email.trim())) p.email = "Add an email address like you@example.com";
  if (d.preferredContact !== "email" && !d.contactHandle.trim()) p.contactHandle = "Add your handle there, or choose email";
  if (!d.requestType) p.requestType = "Choose what kind of deal this is";
  if (!d.offerAsset.trim()) p.offerAsset = "Say what you offer";
  if (!d.wantAsset.trim()) p.wantAsset = "Say what you want";
  if (d.message.length > 2000) p.message = "Keep the message under 2,000 characters";
  if (!consent) p.consent = "Confirm you read the note";
  return p;
}

export function RequestForm() {
  const w = useWallet();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [consent, setConsent] = useState(false);
  const [shareWallet, setShareWallet] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const errs = problems(draft, consent);
  const show = (k: keyof typeof errs) => (tried ? errs[k] : undefined);
  const set = <K extends keyof Draft>(k: K) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const wallet = w.status === "connected" ? w.account?.address : undefined;

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 notch notch-lg slab bg-surface p-6 sm:p-8">
        <h2 className="font-pixel text-[2.5rem]">Request sent</h2>
        <p className="text-[15px] text-muted">
          We will reply by {CONTACTS.find((c) => c.value === draft.preferredContact)?.label.toLowerCase() ?? "email"}. Your reference is{" "}
          <span className="font-mono text-ink">{sent}</span>.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/board" variant="secondary">
            See the public board
          </LinkButton>
          <Button
            variant="quiet"
            onClick={() => {
              setSent(null);
              setDraft(EMPTY);
              setConsent(false);
              setTried(false);
            }}
          >
            Send another request
          </Button>
        </div>
      </div>
    );
  }

  if (!requestsEnabled) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 notch notch-lg slab bg-surface p-6 sm:p-8">
        <h2 className="font-pixel text-[2.1rem]">Not connected yet</h2>
        <p className="text-[15px] text-muted">
          Private requests need the Trade Window backend, and this site is not connected to it yet. Until then, post what you want
          on the board, or open a room with someone you already know.
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/board" variant="secondary">
            Go to the board
          </LinkButton>
          <LinkButton href="/trade" variant="quiet">
            Open a room
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-8 notch notch-lg slab bg-surface p-5 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setTried(true);
        setFailure(null);
        if (Object.keys(errs).length > 0) return;
        setBusy(true);
        try {
          const res = await createDealRequest({
            ...draft,
            name: draft.name.trim(),
            email: draft.email.trim(),
            contactHandle: draft.contactHandle.trim(),
            offerAsset: draft.offerAsset.trim(),
            wantAsset: draft.wantAsset.trim(),
            amountRange: draft.amountRange.trim(),
            message: draft.message.trim(),
            requesterWallet: shareWallet ? wallet : undefined,
            consentAccepted: consent,
          });
          setSent(res.id);
        } catch (err) {
          setFailure(err instanceof RequestError || err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 text-lg font-semibold">The trade</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kind of deal" error={show("requestType")}>
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.requestType} onChange={set("requestType")}>
                <option value="" disabled>
                  Choose one
                </option>
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Chain">
            {({ id }) => (
              <Select id={id} value={draft.chain} onChange={set("chain")}>
                {CHAINS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="What you offer" error={show("offerAsset")}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.offerAsset} onChange={set("offerAsset")} placeholder="5,000 GNOT" maxLength={120} />
            )}
          </Field>
          <Field label="What you want" error={show("wantAsset")}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.wantAsset} onChange={set("wantAsset")} placeholder="ATONE" maxLength={120} />
            )}
          </Field>
        </div>
        <Field label="Rough size, optional" hint="A range is enough.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={draft.amountRange} onChange={set("amountRange")} maxLength={120} />}
        </Field>
        <Field label="Anything else we should know, optional" error={show("message")} hint={`${draft.message.length} of 2,000 characters`}>
          {({ id, describedBy, invalid }) => (
            <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} rows={4} value={draft.message} onChange={set("message")} />
          )}
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-4 text-lg font-semibold">How to reach you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name or nickname" error={show("name")}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.name} onChange={set("name")} autoComplete="nickname" maxLength={120} />
            )}
          </Field>
          <Field label="Email" error={show("email")}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} type="email" aria-describedby={describedBy} aria-invalid={invalid} value={draft.email} onChange={set("email")} autoComplete="email" maxLength={200} />
            )}
          </Field>
          <Field label="Reply by">
            {({ id }) => (
              <Select id={id} value={draft.preferredContact} onChange={set("preferredContact")}>
                {CONTACTS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={draft.preferredContact === "email" ? "Other handle, optional" : "Your handle there"} error={show("contactHandle")}>
            {({ id, describedBy, invalid }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} value={draft.contactHandle} onChange={set("contactHandle")} placeholder="@name" maxLength={120} />
            )}
          </Field>
        </div>
        {wallet && (
          <label className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-flint)]" checked={shareWallet} onChange={(e) => setShareWallet(e.target.checked)} />
            <span>
              Include my connected address <span className="break-all font-mono text-sm text-muted">{wallet}</span>
            </span>
          </label>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 text-[15px]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--color-flint)]"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={!!show("consent")}
          />
          <span>I understand that a request is not a trade: it reserves nothing, and nobody here gives financial advice.</span>
        </label>
        {show("consent") && <p className="pl-7 text-[13px] text-alert">{show("consent")}</p>}
      </div>

      {failure && (
        <p role="alert" className="notch bg-alert-bg px-4 py-3 text-[15px] text-alert">
          {failure}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="primary" busy={busy} busyLabel="Sending…">
          Send request
        </Button>
        {tried && Object.keys(errs).length > 0 && <p className="text-[15px] text-alert">Some fields need a look.</p>}
      </div>
    </form>
  );
}
