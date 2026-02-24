import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-32 text-center">
      <span className="text-6xl">🔍</span>
      <h1 className="text-3xl font-bold">Page Not Found</h1>
      <p className="text-[var(--muted)] max-w-md">
        The page you&apos;re looking for doesn&apos;t exist. Try searching for a
        token or go back to the homepage.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white hover:brightness-110 transition-all"
      >
        Back to Home
      </Link>
    </div>
  );
}
