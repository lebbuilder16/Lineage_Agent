"use client";

import { useState } from "react";
import { Share2, Copy, Check, Twitter } from "lucide-react";
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
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
          "border border-border bg-background text-muted-foreground",
          "hover:text-foreground hover:bg-accent transition-colors",
          open && "bg-accent text-foreground"
        )}
        aria-label="Share"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-10 z-50 w-52 rounded-lg border border-border bg-popover shadow-lg animate-fade-in-scale overflow-hidden">
            <button
              onClick={copyLink}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{copied ? "Copied!" : "Copy link"}</span>
            </button>
            <div className="border-t border-border" />
            <a
              href={tweetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent transition-colors"
            >
              <Twitter className="h-4 w-4 text-muted-foreground" />
              <span>Share on X</span>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
