"use client";

export function SkeletonDerivativeList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {/* Section header skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md skeleton" />
        <div className="h-4 w-24 rounded skeleton" />
        <div className="h-4 w-6 rounded skeleton" />
      </div>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="grid md:grid-cols-2 gap-3">
          {/* Derivative card */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-28 rounded skeleton" />
              <div className="h-4 w-4 rounded skeleton" />
            </div>
            <div className="h-3 w-full rounded skeleton" />
            <div className="flex gap-4">
              <div className="h-3 w-20 rounded skeleton" />
              <div className="h-3 w-20 rounded skeleton" />
            </div>
          </div>
          {/* Evidence panel */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-2.5">
            {[...Array(5)].map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <div className="h-3 w-16 rounded skeleton" />
                <div className="flex-1 h-1.5 rounded-full skeleton" />
                <div className="h-3 w-10 rounded skeleton" />
              </div>
            ))}
            <div className="mt-3.5 pt-3 border-t border-border flex items-center justify-between">
              <div className="h-3 w-16 rounded skeleton" />
              <div className="h-5 w-12 rounded skeleton" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
