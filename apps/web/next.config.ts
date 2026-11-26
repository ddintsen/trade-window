import type { NextConfig } from "next";

// The page may talk only to this site, the chain's RPC and, for private
// requests, the backend; scripts load only from this site. A script slipped
// in from elsewhere (a hijacked dependency or CDN) cannot run or send data
// out, so it cannot swap what people are asked to sign.
const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
};
const rpc = origin(process.env.NEXT_PUBLIC_GNO_RPC_URL || "https://rpc.onyx.testnets.gno.land:443");
const api = origin(process.env.NEXT_PUBLIC_API_URL);
const ws = origin(process.env.NEXT_PUBLIC_WS_URL?.replace(/^http/, "ws"));
const dev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Next's own hydration scripts are inline; nothing loads from elsewhere.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${[rpc, api, ws].filter(Boolean).join(" ")}${dev ? " ws:" : ""}`.trim(),
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/whitepaper", destination: "/how", permanent: true },
      { source: "/escrow", destination: "/how", permanent: true },
      { source: "/company", destination: "/", permanent: true },
      { source: "/careers", destination: "/", permanent: true },
      { source: "/ecosystem", destination: "/", permanent: true },
      { source: "/thank-you", destination: "/request", permanent: true },
      { source: "/trades", destination: "/trade", permanent: true },
      { source: "/history", destination: "/trade", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
