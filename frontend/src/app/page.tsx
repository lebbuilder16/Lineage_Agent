import { SearchBar } from "@/components/SearchBar";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center gap-10 pt-16">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">
          🧬 Meme Lineage Agent
        </h1>
        <p className="text-[var(--muted)] max-w-lg mx-auto">
          Identify the <strong className="text-[var(--foreground)]">root token</strong>{" "}
          and its clones in the Solana memecoin ecosystem. Paste a mint
          address or search by name.
        </p>
      </div>

      <SearchBar />

      <div className="grid sm:grid-cols-3 gap-6 w-full max-w-3xl text-center text-sm mt-4">
        <Feature icon="🔍" title="Detection" desc="Finds clones by comparing name, symbol, image and deployer." />
        <Feature icon="🌳" title="Family Tree" desc="Visualises the lineage graph – root at center, derivatives around." />
        <Feature icon="📊" title="Scoring" desc="Confidence score from 0-100% using weighted multi-signal analysis." />
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 hover:border-[var(--accent)]/50 transition-colors">
      <div className="text-2xl mb-2">{icon}</div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-[var(--muted)]">{desc}</p>
    </div>
  );
}
