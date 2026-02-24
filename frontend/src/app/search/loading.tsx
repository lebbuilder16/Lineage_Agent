export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-20" role="status" aria-label="Loading">
      <div className="h-10 w-10 rounded-full border-4 border-[var(--accent)] border-t-transparent animate-spin" />
      <p className="text-[var(--muted)]">Loading…</p>
    </div>
  );
}
