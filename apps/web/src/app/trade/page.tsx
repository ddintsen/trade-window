import type { Metadata } from "next";
import { Lobby } from "@/components/lobby/lobby";

export const metadata: Metadata = {
  title: "Rooms",
  description: "Open a two-party trade room on Gno.land, or go back to the rooms you opened and joined.",
};

export default async function TradePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const raw = (await searchParams).with;
  // The board links here with ?with=<owner> to invite that account.
  const invite = typeof raw === "string" ? raw.slice(0, 64) : "";
  return <Lobby kind="testnet" invite={invite} />;
}
