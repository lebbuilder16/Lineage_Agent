import { SearchBar } from "@/components/SearchBar";
import { Scan, GitFork, BarChart3 } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex flex-col items-center gap-12 pt-12 sm:pt-20 animate-fade-in">
      {/* Hero */}
      <div className="text-center space-y-4 max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Solana Memecoin Analysis
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Trace the{" "}
          <span className="text-primary">lineage</span>{" "}
          of any memecoin
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
          Identify the <strong className="text-foreground font-medium">root token</strong>{" "}
          and its clones in the Solana ecosystem. Paste a mint address or search by name.
        </p>
      </div>

      {/* Search */}
      <SearchBar />

      {/* Features */}
      <div className="grid sm:grid-cols-3 gap-4 w-full max-w-3xl mt-2 stagger-children">
        <FeatureCard
          icon={<Scan className="h-5 w-5" />}
          title="Clone Detection"
          description="Compares name, symbol, image, and deployer to find copies."
        />
        <FeatureCard
          icon={<GitFork className="h-5 w-5" />}
          title="Family Tree"
          description="Visualizes the full lineage graph from root to derivatives."
        />
        <FeatureCard
          icon={<BarChart3 className="h-5 w-5" />}
          title="Confidence Score"
          description="Weighted multi-signal analysis produces a 0-100% confidence score."
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-lg border border-border bg-card p-5 transition-all duration-200 hover:border-primary/30 hover:shadow-sm animate-slide-up">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        {icon}
      </div>
      <h3 className="font-semibold text-sm mb-1">{title}</h3>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}
