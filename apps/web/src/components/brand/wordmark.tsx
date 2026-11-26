import Link from "next/link";
import { Mark } from "./mark";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-md py-1 text-ink">
      <Mark className="h-[18px] w-auto" title={null} />
      <span className="font-pixel text-[27px]">Trade Window</span>
    </Link>
  );
}
