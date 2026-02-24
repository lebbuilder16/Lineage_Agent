"use client";

export function SkeletonTokenInfo() {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-border bg-card p-5">
      <div className="h-12 w-12 rounded-full skeleton shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded skeleton" />
        <div className="h-3 w-56 rounded skeleton" />
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 w-16 rounded skeleton" />
          ))}
        </div>
        <div className="h-3 w-28 rounded skeleton" />
      </div>
    </div>
  );
}
