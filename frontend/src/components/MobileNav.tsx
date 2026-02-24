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
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when open — iOS-compatible approach
  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      if (scrollY) window.scrollTo(0, parseInt(scrollY || "0") * -1);
    }
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
    };
  }, [open]);

  return (
    <>
      {/* Burger button — mobile only */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="sm:hidden ml-1 flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-colors"
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Full-screen overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-xl sm:hidden"
            onClick={() => setOpen(false)}
          >
            <motion.nav
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center min-h-screen gap-2 px-6"
              onClick={(e) => e.stopPropagation()}
            >
              {navItems.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, duration: 0.3 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block px-6 py-3 rounded-2xl text-center text-lg font-display font-semibold uppercase tracking-wider text-white/70 hover:text-white hover:bg-white/5 transition-all"
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + navItems.length * 0.05, duration: 0.3 }}
                className="mt-4 flex items-center gap-4"
              >
                <Link
                  href="/search"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-neon text-black font-display font-bold text-sm hover:bg-neon/90 transition-all"
                >
                  <Search className="h-4 w-4" />
                  Analyse
                </Link>
                <a
                  href="https://github.com/lebbuilder16/Lineage_Agent"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="GitHub"
                >
                  <Github className="h-4 w-4" />
                </a>
              </motion.div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
