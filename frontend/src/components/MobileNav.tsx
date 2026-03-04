"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Github, Search } from "lucide-react";

const navItems = [
  { label: "About", href: "/#about" },
  { label: "Signals", href: "/#signals" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQ", href: "/#faq" },
  { label: "Dashboard", href: "/dashboard" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Burger button — mobile only */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="sm:hidden ml-1 flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Invisible backdrop — click outside to close, does NOT block the screen */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[89] sm:hidden"
              aria-hidden
              onClick={() => setOpen(false)}
            />

            {/* Dropdown card — positioned just below the pill nav (top-20 = 80px matches main pt-20) */}
            <motion.div
              key="dropdown"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-20 left-4 right-4 z-[90] sm:hidden rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden"
            >
              <nav className="flex flex-col p-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}

                {/* Divider */}
                <div className="my-2 border-t border-white/8" />

                {/* CTA + GitHub row */}
                <div className="flex items-center gap-2 px-2 pb-1">
                  <Link
                    href="/search"
                    onClick={() => setOpen(false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neon text-black font-bold text-sm hover:bg-neon/90 transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Analyse
                  </Link>
                  <a
                    href="https://github.com/lebbuilder16/Lineage_Agent"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                    aria-label="GitHub"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
