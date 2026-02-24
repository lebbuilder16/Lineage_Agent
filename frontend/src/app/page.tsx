"use client";

import { SearchBar } from "@/components/SearchBar";
import { Scan, GitFork, BarChart3 } from "lucide-react";
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center gap-12 pt-12 sm:pt-20">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="text-center space-y-4 max-w-xl"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Solana Memecoin Analysis
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Trace the{" "}
          <span className="text-primary">lineage</span>{" "}
          of any memecoin
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
          Identify the <strong className="text-foreground font-medium">root token</strong>{" "}
          and its clones in the Solana ecosystem. Paste a mint address or search by name.
        </p>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
        className="w-full"
      >
        <SearchBar />
        <p className="mt-2 text-center text-xs text-muted-foreground/60">
          Press{" "}
          <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px]">⌘K</kbd>
          {" "}to open anywhere
        </p>
      </motion.div>

      {/* Feature cards */}
      <div className="grid sm:grid-cols-3 gap-4 w-full max-w-3xl mt-2">
        {[
          { icon: <Scan className="h-5 w-5" />, title: "Clone Detection", description: "Compares name, symbol, image, and deployer to find copies.", delay: 0.2 },
          { icon: <GitFork className="h-5 w-5" />, title: "Family Tree", description: "Interactive lineage graph — click any node to dive deeper.", delay: 0.28 },
          { icon: <BarChart3 className="h-5 w-5" />, title: "Confidence Score", description: "Weighted multi-signal analysis produces a 0-100% score.", delay: 0.36 },
        ].map((f) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: f.delay, duration: 0.4, ease: "easeOut" }}
          >
            <FeatureCard icon={f.icon} title={f.title} description={f.description} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group h-full rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-sm">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        {icon}
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}
