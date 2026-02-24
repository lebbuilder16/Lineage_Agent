"use client";

import { useState } from "react";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LineageResult } from "@/lib/api";

interface Props {
  data: LineageResult;
}

export function ShareButton({ data }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const rootName = data.root?.name || data.root?.symbol || "this token";
  const pct = Math.round(data.confidence * 100);

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setOpen(false);
  };

  const tweetText = encodeURIComponent(
    `🔍 Lineage of ${rootName} — ${pct}% confidence, ${data.family_size} tokens in family\n\n${url}`
  );
  const tweetUrl = `https://x.com/intent/tweet?text=${tweetText}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium",
          "border border-white/10 bg-background text-muted-foreground",
          "hover:text-foreground hover:bg-white/5 transition-colors",
          open && "bg-white/5 text-foreground"
        )}
        aria-label="Share"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && (
        <>
          {/* Backdrop — above nav to properly intercept clicks */}
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div
            className="absolute right-0 top-10 z-[56] w-52 rounded-xl border border-white/10 bg-[#0f0f0f] shadow-2xl animate-fade-in-scale overflow-hidden"
            role="menu"
            aria-label="Share options"
          >
            <button
              onClick={copyLink}
              role="menuitem"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5 transition-colors text-left"
            >
              {copied ? (
                <Check className="h-4 w-4 text-neon" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{copied ? "Copied!" : "Copy link"}</span>
            </button>
            <div className="border-t border-white/5" />
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5 transition-colors"
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <span>Share on X</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
