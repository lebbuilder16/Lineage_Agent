"use client";

import { useEffect, useRef } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  value: number; // 0-100
  level: "high" | "medium" | "low";
  size?: number;
}

const levelColors = {
  high: "hsl(142, 76%, 36%)",
  medium: "hsl(38, 92%, 50%)",
  low: "hsl(0, 84%, 60%)",
};

const levelTextColors = {
  high: "text-success",
  medium: "text-warning",
  low: "text-destructive",
};

export function RadialGauge({ value, level, size = 108 }: Props) {
  const R = (size / 2) * 0.72;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -215; // degrees from top
  const endAngle = 35;
  const totalArc = endAngle - startAngle; // 250 degrees

  const circumference = (totalArc / 360) * 2 * Math.PI * R;

  const spring = useSpring(0, { stiffness: 100, damping: 30 });
  const dashOffset = useTransform(spring, (v) => circumference - (v / 100) * circumference);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const polarToCartesian = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: cx + R * Math.cos(rad),
      y: cy + R * Math.sin(rad),
    };
  };

  const describeArc = (start: number, end: number) => {
    const s = polarToCartesian(start);
    const e = polarToCartesian(end);
    const largeArc = end - start <= 180 ? "0" : "1";
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const trackPath = describeArc(startAngle, endAngle);

  const color = levelColors[level];
  const strokeDasharray = `${circumference} ${circumference}`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible -rotate-[0deg]">
        {/* Track (background) */}
        <path
          d={trackPath}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={size * 0.07}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <motion.path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.07}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          style={{ strokeDashoffset: dashOffset, pathLength: 1 }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className={cn("text-2xl font-bold tabular-nums leading-none", levelTextColors[level])}
        >
          {value}
        </motion.span>
        <span className="text-[10px] text-muted-foreground font-medium mt-0.5">%</span>
      </div>
    </div>
  );
}
