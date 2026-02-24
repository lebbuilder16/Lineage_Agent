import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";
import { CommandPalette } from "@/components/CommandPalette";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`min-h-screen ${GeistSans.variable} ${GeistMono.variable} ${syne.variable}`}>
        <CommandPalette />
        <Providers>
          {/* Pill nav — fixed, glassmorphism */}
          <header className="fixed top-5 left-0 right-0 z-50 flex justify-center px-4">
            <nav className="pill-nav flex items-center gap-1 px-2 py-2">
              {/* Logo */}
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-1 rounded-full transition-colors hover:bg-white/5"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-neon text-black text-xs font-black font-display">
                  L
                </div>
                <span className="font-display font-bold text-sm tracking-tight text-white">
                  LINEAGE<span className="text-neon">AGENT</span>
                </span>
              </Link>

              {/* Divider */}
              <div className="h-4 w-px bg-white/10 mx-1" />

              {/* Nav links */}
              <div className="hidden sm:flex items-center gap-1">
                {[
                  { label: "About", href: "/#about" },
                  { label: "Signals", href: "/#signals" },
                  { label: "How it works", href: "/#how-it-works" },
                  { label: "FAQ", href: "/#faq" },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-1 rounded-full text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors"
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
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-neon text-black text-sm font-bold font-display hover:bg-neon/90 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Analyse
              </Link>

              {/* GitHub link */}
              <a
                href="https://github.com/lebbuilder16/Lineage_Agent"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="GitHub"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
            </nav>
          </header>

          {/* Main content — padded top for fixed nav */}
          <main className="mx-auto max-w-6xl px-4 pt-24 pb-8 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

