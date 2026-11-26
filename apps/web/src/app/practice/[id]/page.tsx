import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TradeWindow } from "@/components/trade/trade-window";
import { parseRoomId } from "@/lib/route";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Practice trade ${id}`, robots: { index: false } };
}

export default async function PracticeRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseRoomId((await params).id);
  if (id === null) notFound();
  return <TradeWindow kind="practice" id={id} />;
}
