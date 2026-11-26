import type { Metadata } from "next";
import { Lobby } from "@/components/lobby/lobby";

export const metadata: Metadata = {
  title: "Practice rooms",
  description: "Try a trade room with play balances and a scripted partner. Same rules as the realm, nothing touches a chain.",
};

export default function PracticePage() {
  return <Lobby kind="practice" />;
}
