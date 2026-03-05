"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export default function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors"
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  );
}
