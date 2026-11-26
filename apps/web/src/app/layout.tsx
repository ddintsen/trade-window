import type { Metadata, Viewport } from "next";
import { Handjet, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/site/footer";
import { Backdrop } from "@/components/site/backdrop";
import { Header } from "@/components/site/header";
import { Toaster } from "@/components/ui/toast";

const sans = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

// Pixel numerals and titles for the trade window, the family 67 uses.
const pixel = Handjet({
  subsets: ["latin"],
  axes: ["ELGR", "ELSH"],
  variable: "--font-handjet",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const description =
  "Two-party trade rooms on Gno.land. Both sides put in GNOT, tokens or NFTs, get ready on the same version of the room, and the second ready mark swaps everything in one transaction.";

export const metadata: Metadata = {
  metadataBase: new URL("https://tradewindow.xyz"),
  title: { default: "Trade Window", template: "%s, Trade Window" },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Trade Window",
    description,
    url: "https://tradewindow.xyz",
    siteName: "Trade Window",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Trade Window", description },
};

export const viewport: Viewport = {
  themeColor: "#0b0e0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${pixel.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-flint px-3 py-2 text-ground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Backdrop />
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
