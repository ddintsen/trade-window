import { ImageResponse } from "next/og";
import { MarkBoxes } from "@/components/brand/mark-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0E0D" }}>
        <MarkBoxes unit={28} />
      </div>
    ),
    size,
  );
}
