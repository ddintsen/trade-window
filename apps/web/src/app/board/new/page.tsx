import type { Metadata } from "next";
import Link from "next/link";
import { PostForm } from "@/components/board/post-form";

export const metadata: Metadata = {
  title: "Post a listing",
  description: "Say what you give and what you want. The listing lives in the board realm, public for good.",
};

export default function NewListingPage() {
  return (
    <div className="shell py-10 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,40rem)] lg:gap-16">
        <header className="flex flex-col gap-4">
          <Link href="/board" className="w-fit notch text-sm text-muted hover:text-ink">
            Board
          </Link>
          <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Post a listing</h1>
          <p className="text-[17px] text-muted">
            A listing is a short public note: what you give, what you want. It holds no assets. Whoever is interested opens a room
            with you, and nothing moves until you are both ready.
          </p>
        </header>
        <PostForm />
      </div>
    </div>
  );
}
