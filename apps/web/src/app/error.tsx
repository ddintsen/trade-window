"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="shell flex flex-col items-start gap-5 py-20">
      <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">This page stopped working</h1>
      <p className="max-w-xl text-[17px] text-muted">
        Something in this page failed in your browser. Nothing was sent on your behalf: anything on chain is exactly as it was.
      </p>
      {error.digest && <p className="text-sm text-muted">Reference {error.digest}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <LinkButton href="/" variant="secondary">
          Go to the start page
        </LinkButton>
      </div>
    </div>
  );
}
