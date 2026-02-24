import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Meme Lineage Agent",
  description:
    "Detect and explore the lineage of Solana memecoins – find the root token and its clones.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="border-b border-[var(--border)] px-6 py-4">
            <a href="/" className="flex items-center gap-2 hover:opacity-80">
              <span className="text-2xl">🧬</span>
              <span className="font-bold text-lg tracking-tight">
                Meme Lineage Agent
              </span>
            </a>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
