"use client";

import React from "react";

interface MarqueeProps {
  items: string[];
  direction?: "left" | "right";
  speed?: "slow" | "normal" | "fast";
  className?: string;
  separator?: string;
}

export function Marquee({
  items,
  direction = "left",
  speed = "normal",
  className = "",
  separator = "★",
}: MarqueeProps) {
  const durationMap = { slow: "40s", normal: "28s", fast: "16s" };
  const animationName = direction === "left" ? "marquee-left" : "marquee-right";

  const allItems = [...items, ...items, ...items, ...items]; // 4× duplication for seamless loop on wide screens

  return (
    <div
      className={`relative overflow-hidden w-full ${className}`}
      aria-hidden="true"
      style={{
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
      }}
    >
      <div
        className="flex gap-8 whitespace-nowrap will-change-transform"
        style={{
          animation: `${animationName} ${durationMap[speed]} linear infinite`,
          width: "max-content",
        }}
      >
        {allItems.map((item, i) => (
          <React.Fragment key={i}>
            <span className="text-sm font-display font-semibold tracking-widest uppercase text-white/70">
              {item}
            </span>
            <span className="text-neon text-xs">{separator}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
