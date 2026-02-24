"use client";

export function SkeletonLineageCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="h-7 w-7 rounded-md skeleton" />
        <div className="h-5 w-36 rounded skeleton" />
      </div>
      <div className="grid sm:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 rounded skeleton" />
            <div className="h-9 w-16 rounded skeleton" />
            <div className="h-1.5 w-full rounded-full skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}
