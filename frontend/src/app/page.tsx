"use client";

import { SearchBar } from "@/components/SearchBar";
import { Marquee } from "@/components/Marquee";
import { Scan, GitFork, BarChart3, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

/* ─── helpers ────────────────────────────────────────────────────── */
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
});

export default function HomePage() {
  return (
    <div className="min-h-[calc(100svh-5rem)] overflow-x-hidden">

      {/* ── 1. Hero ─────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-[calc(100svh-5rem)] px-4 text-center pt-32 pb-24">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(57,255,20,0.1) 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-10"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <motion.div {...fadeUp(0)} className="flex flex-col items-center gap-6 max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/5 px-4 py-1.5 text-xs font-display font-semibold tracking-widest uppercase text-neon">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon/60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon" />
            </span>
            Solana Memecoin Intelligence
          </div>

          <h1 className="display-heading text-display-xl text-white leading-none">
            PRESENTING
            <br />
            <span className="neon-glow">LINEAGE</span>
            <br />
            AGENT
          </h1>

          <p className="text-white/50 text-base sm:text-lg max-w-lg leading-relaxed">
            Tired of getting rugged by clones? We sniff out the{" "}
            <span className="text-white font-medium">original token</span> and expose every
            impersonator in the family tree.{" "}
            <span className="text-neon">No cap.</span>
          </p>

          <div className="w-full max-w-xl mt-2">
            <SearchBar />
            <p className="mt-2 text-center text-xs text-white/30">
              Press{" "}
              <kbd className="inline-flex h-4 items-center rounded border border-white/10 bg-white/5 px-1 font-mono text-[9px]">⌘K</kbd>
              {" "}to open anywhere
            </p>
          </div>

          <div className="flex flex-wrap gap-3 justify-center mt-2">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-neon text-black font-display font-bold text-sm hover:bg-neon/90 transition-all hover:scale-105 active:scale-95"
            >
              <Scan className="h-4 w-4" />
              Start Detecting Clones
            </Link>
            <a
              href="#about"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/10 text-white/70 font-display font-semibold text-sm hover:border-white/30 hover:text-white transition-all"
            >
              How does it work?
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="absolute bottom-8 flex flex-col items-center gap-1 text-white/20"
        >
          <span className="text-xs font-display tracking-widest uppercase">Scroll</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </motion.div>
      </section>

      {/* ── 2. Marquee ──────────────────────────────────────────── */}
      <section className="w-full border-y border-white/5 bg-white/[0.02] py-5">
        <Marquee
          items={["DexScreener", "Solana RPC", "Jupiter", "Pump.fun", "Raydium", "Helius", "IPFS", "Birdeye"]}
          direction="left"
          separator="◆"
          className="py-1"
        />
      </section>

      {/* ── 3. About ────────────────────────────────────────────── */}
      <section id="about" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-36">
        <div className="grid sm:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="display-heading text-[8rem] sm:text-[11rem] leading-none neon-glow select-none">
              LFG!
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            <p className="display-heading text-xs tracking-widest uppercase text-neon">What is this about?</p>
            <h2 className="display-heading text-display-md text-white">
              WE DETECT<br />MEMECOIN<br />CLONES
            </h2>
            <p className="text-white/50 leading-relaxed">
              Every day, degens on Solana launch hundreds of tokens copying yesterday&apos;s winner.
              Same vibe, same ticker, different deployer pocketing your SOL.
            </p>
            <p className="text-white/50 leading-relaxed">
              Lineage Agent cross-references name, symbol, image hash, deployer wallet, and
              temporal data to compute a confidence score. Think of it as{" "}
              <span className="text-white">a DNA test for memecoins</span>. Or a very aggressive
              fact-checker at Thanksgiving.
            </p>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-neon text-black font-display font-bold text-sm hover:bg-neon/90 transition-all hover:scale-105 active:scale-95"
            >
              Try it →
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── 4. Features ─────────────────────────────────────────── */}
      <section className="w-full border-y border-white/5 bg-white/[0.015] py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5 }}
            className="mb-14 flex flex-col items-center text-center gap-3"
          >
            <p className="display-heading text-xs tracking-widest uppercase text-neon">Features</p>
            <h2 className="display-heading text-display-md text-white">SOLID SIGNALS</h2>
            <p className="text-white/40 max-w-md">
              Multi-layer analysis so detailed it would make your on-chain analyst cry.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                icon: <Scan className="h-6 w-6" />,
                tag: "01",
                title: "Clone Detection",
                description: "Compares name, symbol, image hash, and deployer wallet across all known Solana tokens. If it looks like DOGE and smells like DOGE, it&apos;s probably a DOGE clone.",
              },
              {
                icon: <GitFork className="h-6 w-6" />,
                tag: "02",
                title: "Family Tree",
                description: "Interactive lineage graph powered by React Flow. Click any node to drill deeper into a token&apos;s bloodline. Warning: some family trees are deeply disturbing.",
              },
              {
                icon: <BarChart3 className="h-6 w-6" />,
                tag: "03",
                title: "Confidence Score",
                description: "Weighted multi-signal analysis produces a 0-100% confidence score. Above 70%? That token has more red flags than a Soviet parade.",
              },
            ].map((f, i) => (
              <motion.div
                key={f.tag}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className="group h-full rounded-2xl border border-white/5 bg-card p-7 transition-all duration-300 hover:border-neon/20 hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between mb-5">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neon transition-colors group-hover:bg-neon/10 group-hover:border-neon/30">
                      {f.icon}
                    </div>
                    <span className="font-display font-bold text-4xl text-white/[0.05] group-hover:text-white/[0.08] transition-colors">
                      {f.tag}
                    </span>
                  </div>
                  <h3 className="display-heading font-bold text-base text-white mb-2 uppercase tracking-wide">
                    {f.title}
                  </h3>
                  <p className="text-white/40 text-sm leading-relaxed">{f.description.replace(/&apos;/g, "'")}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Signals ──────────────────────────────────────────── */}
      <section id="signals" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-36">
        <div className="grid sm:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="space-y-5"
          >
            <p className="display-heading text-xs tracking-widest uppercase text-neon">Signals</p>
            <h2 className="display-heading text-display-md text-white">
              HOW WE<br />CATCH THEM
            </h2>
            <p className="text-white/40 leading-relaxed">
              Five weighted signals, one verdict. Like a lie detector test — but for tokens, and
              actually accurate.
            </p>
            <Marquee
              items={["Name Match", "Symbol Match", "Image Hash", "Deployer", "Temporal"]}
              direction="right"
              speed="slow"
              separator="→"
              className="py-2"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="space-y-4"
          >
            {[
              { label: "Name Match", pct: 30, desc: "Fuzzy string similarity on token name" },
              { label: "Symbol Match", pct: 25, desc: "Exact and near-match ticker comparison" },
              { label: "Image Hash", pct: 25, desc: "Perceptual hash of logo/icon metadata" },
              { label: "Deployer Wallet", pct: 15, desc: "Same wallet = same person, probably" },
              { label: "Temporal Proximity", pct: 5, desc: "Launched 10 mins after the OG? Sus." },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                className="space-y-1.5"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-display font-semibold text-white uppercase tracking-wide text-xs">
                    {s.label}
                  </span>
                  <span className="font-display font-bold text-neon">{s.pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-neon"
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(s.pct / 30) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07 + 0.2, duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <p className="text-white/30 text-xs">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── 6. Process ──────────────────────────────────────────── */}
      <section className="w-full border-y border-white/5 bg-white/[0.015] py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 flex flex-col items-center text-center gap-3"
          >
            <p className="display-heading text-xs tracking-widest uppercase text-neon">Process</p>
            <h2 className="display-heading text-display-md text-white">HOW IT WORKS</h2>
          </motion.div>

          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { step: "01", title: "INPUT", description: "Paste a Solana mint address or search by token name. We accept both — we&apos;re not picky." },
              { step: "02", title: "ANALYSIS", description: "Our agent queries DexScreener, Solana RPC, and IPFS to collect all metadata. Takes ~5 seconds." },
              { step: "03", title: "SCORING", description: "Five signals are weighted and combined into a confidence score. The math is real, I promise." },
              { step: "04", title: "RESULTS", description: "Full family tree, derivative list, and lineage card. Share with your degen friends via X." },
            ].map((r, i) => (
              <motion.div
                key={r.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="relative p-6 rounded-2xl border border-white/5 bg-card hover:border-neon/15 transition-all group"
              >
                <span className="display-heading font-bold text-5xl text-white/[0.04] group-hover:text-neon/10 transition-colors block mb-4">
                  {r.step}
                </span>
                <h3 className="display-heading font-bold text-sm text-white uppercase tracking-widest mb-2">
                  {r.title}
                </h3>
                <p className="text-white/40 text-xs leading-relaxed">{r.description.replace(/&apos;/g, "'")}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. How to Use ────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-4 sm:px-6 py-24 sm:py-36">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-14 text-center space-y-3"
        >
          <p className="display-heading text-xs tracking-widest uppercase text-neon">Tutorial</p>
          <h2 className="display-heading text-display-md text-white">USE IT OR LOSE IT</h2>
          <p className="text-white/40 max-w-sm mx-auto">Four steps. Even your favourite coin dev can follow this.</p>
        </motion.div>

        <div className="space-y-3">
          {[
            { num: "1", title: "Find a suspicious token", body: "Go to DexScreener, find a token that smells funny, copy its mint address (the long base58 string, not the ticker)." },
            { num: "2", title: "Paste it in the search bar", body: "Click the search bar on the home page, paste the address (or hit ⌘K from anywhere), and press Enter. On mobile, tap the clipboard icon." },
            { num: "3", title: "Wait ~5 seconds", body: "We are literally talking to multiple on-chain data sources simultaneously. Good things take time. Patience, degen." },
            { num: "4", title: "Read the results", body: "The Lineage Card shows the root token, confidence score, and all known clones. Green = mostly original. Red = blatant copy. Share the tea on X." },
          ].map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.1, duration: 0.45 }}
              className="flex gap-5 p-6 rounded-2xl border border-white/5 bg-card hover:border-neon/15 transition-all group"
            >
              <div className="flex-shrink-0 h-9 w-9 rounded-full border border-neon/30 bg-neon/5 text-neon flex items-center justify-center font-display font-bold text-sm group-hover:bg-neon group-hover:text-black transition-all">
                {s.num}
              </div>
              <div>
                <h3 className="display-heading font-bold text-sm text-white uppercase tracking-wide mb-1">{s.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed">{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 8. FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="w-full border-t border-white/5 bg-white/[0.015] py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-14 text-center space-y-3"
          >
            <p className="display-heading text-xs tracking-widest uppercase text-neon">FAQ</p>
            <h2 className="display-heading text-display-md text-white">DUMB QUESTIONS,<br />SMART ANSWERS</h2>
          </motion.div>
          <FaqSection />
        </div>
      </section>

      {/* ── 9. Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center gap-8 text-center">
            <div>
              <p className="display-heading text-display-lg text-white leading-none">LINEAGE</p>
              <p className="display-heading text-display-lg neon-glow leading-none">AGENT</p>
            </div>
            <div className="flex flex-wrap gap-6 justify-center">
              {[
                { label: "Home", href: "/", internal: true },
                { label: "Search", href: "/search", internal: true },
                { label: "About", href: "/#about", internal: true },
                { label: "Signals", href: "/#signals", internal: true },
                { label: "FAQ", href: "/#faq", internal: true },
                { label: "GitHub", href: "https://github.com/lebbuilder16/Lineage_Agent", internal: false },
              ].map((l) => (
                l.internal
                  ? <Link key={l.label} href={l.href} className="text-white/40 hover:text-white text-sm transition-colors">{l.label}</Link>
                  : <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white text-sm transition-colors">{l.label}</a>
              ))}
            </div>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-neon text-black font-display font-bold hover:bg-neon/90 transition-all hover:scale-105"
            >
              Start Detecting →
            </Link>
            <p className="text-white/20 text-xs font-display tracking-widest uppercase">
              Built with love for degens. Not financial advice. Obviously.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── FAQ Accordion ──────────────────────────────────────────────── */
const FAQs = [
  {
    q: "Is this actually accurate?",
    a: "We compare name, symbol, image hash, deployer wallet, and launch timing across thousands of tokens. The confidence score reflects all five signals. Above 70% means very likely a clone. Below 30% means probably original. 50-70% means do your own research — like a responsible degen.",
  },
  {
    q: "Will this protect me from getting rugged?",
    a: "Lineage Agent tells you if a token is a COPY of something that came before it. Whether the original or the copy will rug you is a different question, and frankly above our pay grade.",
  },
  {
    q: "How fast is the analysis?",
    a: "Typically 3-8 seconds per token. We make multiple async calls to DexScreener, Solana RPC, and IPFS simultaneously. There's a live WebSocket progress bar so you can watch the anxiety unfold in real-time.",
  },
  {
    q: "What chains do you support?",
    a: "Solana only for now. Ethereum people, we see you. We'll get there. When? Probably after the next bull run.",
  },
  {
    q: "Is my search private?",
    a: "We don't store personal data. Your search history lives in your own browser's localStorage. We do aggregate anonymous usage stats because we like graphs, not because we're farming your data.",
  },
  {
    q: "Can I use the API?",
    a: "Yes! The backend is open source and the API is documented in the GitHub README. You can call /lineage?mint=... directly. Please don't hammer it with 1000 requests/sec — we're on a budget.",
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {FAQs.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{ delay: i * 0.07, duration: 0.4 }}
          className="rounded-2xl border border-white/5 bg-card overflow-hidden"
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between px-6 py-5 text-left hover:bg-white/[0.03] transition-colors"
          >
            <span className="display-heading font-semibold text-sm text-white uppercase tracking-wide">
              {item.q}
            </span>
            <ChevronDown
              className={`flex-shrink-0 ml-4 h-4 w-4 text-neon transition-transform duration-300 ${open === i ? "rotate-180" : ""}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <div className="px-6 pb-5 text-white/50 text-sm leading-relaxed border-t border-white/5 pt-4">
                  {item.a}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
