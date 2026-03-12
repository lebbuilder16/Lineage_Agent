import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileNav } from "@/components/MobileNav";
import AlertBell from "@/components/AlertBell";
import dynamic from "next/dynamic";

const WalletButton = dynamic(() => import("@/components/WalletButton"), {
  ssr: false,
  loading: () => (
    <div className="h-[38px] w-[90px] rounded-full bg-white/5 border border-white/10 animate-pulse" />
  ),
});

const AuthGate = dynamic(() => import("@/components/AuthGate"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="h-8 w-8 rounded-full border-2 border-[#622EC3]/30 border-t-[#622EC3] animate-spin" />
    </div>
  ),
});
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Syne } from "next/font/google";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meme Lineage Agent",
  description:
    "Detect and explore the lineage of Solana memecoins – find the root token and its clones.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "Meme Lineage Agent",
    description:
      "Detect and explore the lineage of Solana memecoins – find the root token and its clones.",
    type: "website",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`min-h-screen ${GeistSans.variable} ${GeistMono.variable} ${syne.variable}`}>
        <Providers>
          <CommandPalette />
          {/* Skip to content — accessibility */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-full focus:bg-[#622EC3] focus:px-4 focus:py-2 focus:text-white focus:font-bold focus:text-sm"
          >
            Skip to content
          </a>

          {/* Pill nav — fixed, glassmorphism */}
          <header
            className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4"
            style={{
              paddingTop: "max(0.5rem, env(safe-area-inset-top))",
              paddingBottom: "0.5rem",
              background: "linear-gradient(to bottom, #000000 60%, transparent)",
            }}
          >
            <nav className="pill-nav flex items-center gap-1 px-2 py-2">
              {/* Logo */}
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1 rounded-full transition-colors hover:bg-white/5"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#622EC3] text-white text-xs font-black font-display">
                  L
                </div>
                <span className="font-display font-bold text-sm tracking-tight text-white">
                  LINEAGE<span className="text-[#53E9F6]">AGENT</span>
                </span>
              </Link>

              {/* Divider */}
              <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />

              {/* Nav links — desktop only */}
              <div className="hidden sm:flex items-center gap-1">
                {[
                  { label: "Compare", href: "/compare" },
                  { label: "Dashboard", href: "/dashboard" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 min-h-[44px] inline-flex items-center rounded-full text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* Divider */}
              <div className="hidden sm:block h-4 w-px bg-white/10 mx-1" />

              {/* CTA button */}
              <Link
                href="/search"
                className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full bg-[#622EC3] text-white text-sm font-bold font-display hover:bg-[#7B45E0] transition-colors shadow-[0_0_12px_rgba(98,46,195,0.4)]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span className="hidden sm:inline">Analyse</span>
              </Link>

              {/* Alert bell — real-time notifications */}
              <AlertBell />

              {/* Wallet / auth button */}
              <WalletButton />

              {/* Mobile burger */}
              <MobileNav />
            </nav>
          </header>

          {/* Main content — header height = ~5rem so pt-20 (80px) clears the fixed nav */}
          <main id="main" className="mx-auto max-w-6xl px-4 pt-20 pb-8 sm:px-6">
            <AuthGate>{children}</AuthGate>
          </main>
        </Providers>
      </body>
    </html>
  );
}

