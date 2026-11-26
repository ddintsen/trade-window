import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trade Window",
    short_name: "Trade Window",
    description: "Two-party trade rooms on gno.land. Nothing crosses until you are both ready.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e0d",
    theme_color: "#0b0e0d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
