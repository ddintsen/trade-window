import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="shell flex flex-col items-start gap-5 py-20">
      <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">There is nothing at this address</h1>
      <p className="max-w-xl text-[17px] text-muted">
        The link may be mistyped, or the page moved when Trade Window went on chain.
      </p>
      <div className="flex flex-wrap gap-3">
        <LinkButton href="/practice" variant="primary">
          Practice rooms
        </LinkButton>
        <LinkButton href="/trade" variant="secondary">
          Rooms
        </LinkButton>
        <LinkButton href="/" variant="quiet">
          Start page
        </LinkButton>
      </div>
    </div>
  );
}
