import Link from "next/link";

export default function ToolsPage() {
  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Tools</h1>
      <p className="text-base-content/70">Calculators and utilities for planning your runs.</p>
      <Link href="/tech" className="card bg-base-200 hover:bg-base-300 transition-colors block">
        <div className="card-body p-4">
          <span className="font-medium">Tech-tree cost calculator</span>
          <span className="text-sm text-base-content/70">Total resources needed to unlock any technology.</span>
        </div>
      </Link>
    </section>
  );
}
