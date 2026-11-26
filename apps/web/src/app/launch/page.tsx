import type { Metadata } from "next";
import { LaunchPanel } from "@/components/launch/launch-panel";
import { network } from "@/lib/chain/config";

export const metadata: Metadata = {
  title: "Launch",
  description: `Publish the Trade Window realms on ${network.name} from the owner's wallet.`,
  robots: { index: false, follow: false },
};

export default function LaunchPage() {
  return (
    <div className="shell py-10 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,44rem)] lg:gap-16">
        <header className="flex flex-col gap-4">
          <h1 className="font-pixel text-[clamp(3rem,2.3rem+2.4vw,4.5rem)]">Put Trade Window on {network.name}</h1>
          <p className="text-[17px] text-muted">
            For the project owner. Your wallet publishes the rooms and board realms under your own namespace, so you are their admin and
            treasury from the start, and no other key is involved.
          </p>
          <p className="text-[15px] text-muted">
            Each step is one transaction you confirm in Adena. The code is the repository&apos;s, without its tests, exactly as the
            deploy script sends it.
          </p>
        </header>
        <LaunchPanel />
      </div>
    </div>
  );
}
