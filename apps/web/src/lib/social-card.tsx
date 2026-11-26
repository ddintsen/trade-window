import { ImageResponse } from "next/og";
import { MarkBoxes } from "@/components/brand/mark-image";
import { instrumentSans } from "@/lib/og-fonts";

export const SOCIAL_SIZE = { width: 1200, height: 630 };

/** The social card: the headline beside the mark. */
export async function socialCard() {
  const [display, body] = await Promise.all([instrumentSans(600, 75), instrumentSans(400, 100)]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 600 as const, style: "normal" as const }] : []),
    ...(body ? [{ name: "Body", data: body, weight: 400 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#0B0E0D", color: "#E8EEEB" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 660, paddingLeft: 80 }}>
          <div style={{ fontFamily: "Display", fontSize: 96, lineHeight: 0.92, letterSpacing: -2, maxWidth: 540 }}>
            Nothing crosses until you are both ready
          </div>
          <div style={{ fontFamily: "Body", fontSize: 24, color: "#9AA6A1", marginTop: 28, whiteSpace: "nowrap" }}>Trade Window, two-party trade rooms on gno.land</div>
        </div>
        <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
          <MarkBoxes unit={76} />
        </div>
      </div>
    ),
    { ...SOCIAL_SIZE, fonts },
  );
}
