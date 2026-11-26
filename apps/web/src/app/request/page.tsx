import type { Metadata } from "next";
import Link from "next/link";
import { RequestForm } from "@/components/request/request-form";

export const metadata: Metadata = {
  title: "Private request",
  description: "Ask for a trade you would rather not post on the public board.",
};

export default function RequestPage() {
  return (
    <div className="shell py-10 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,40rem)] lg:gap-16">
        <header className="flex flex-col gap-4">
          <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Private request</h1>
          <p className="text-[17px] text-muted">
            For a trade you would rather not post on the public{" "}
            <Link href="/board" className="text-ink underline underline-offset-4">
              board
            </Link>
            . Tell us what you want to trade; we review the request and contact you to arrange it.
          </p>
          <p className="text-[15px] text-muted">
            A request moves nothing and reserves nothing. When both sides agree, the trade itself still happens in a room, and
            nothing moves until you are both ready.
          </p>
        </header>
        <RequestForm />
      </div>
    </div>
  );
}
