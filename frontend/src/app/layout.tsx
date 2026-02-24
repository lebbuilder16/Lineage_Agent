import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Meme Lineage Agent",
  description:
    "Detect and explore the lineage of Solana memecoins – find the root token and its clones.",
  icons: {
    icon: "/favicon.ico",
  },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches)){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80">
              <span className="text-2xl" aria-hidden="true">🧬</span>
              <span className="font-bold text-lg tracking-tight">
                Meme Lineage Agent
              </span>
            </Link>
            <ThemeToggle />
          </header>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
