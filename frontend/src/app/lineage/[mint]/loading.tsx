export default function Loading() {
  return (
    <div
      className="flex flex-col items-center gap-3 py-20 animate-pulse"
      role="status"
      aria-label="Analyzing lineage"
    >
      <div className="h-10 w-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
      <p className="text-[var(--muted)]">Analyzing lineage…</p>
    </div>
  );
}
