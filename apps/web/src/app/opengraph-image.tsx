import { socialCard } from "@/lib/social-card";

export const alt = "Trade Window: nothing crosses until you are both ready";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return socialCard();
}
