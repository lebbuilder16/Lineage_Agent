"use client";
import { useEffect, useState } from "react";

/**
 * Returns true when the viewport width is < 640px (Tailwind's `sm` breakpoint).
 * Safe for SSR — defaults to false until mounted.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
