import type { Metadata } from "next";
import { BoardView } from "@/components/board/board-view";

export const metadata: Metadata = {
  title: "Board",
  description: "Public offers on Gno.land: what people give and what they want. Open a room with the owner to trade.",
};

export default function BoardPage() {
  return <BoardView />;
}
