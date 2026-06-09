import Link from "next/link";

export default function ToolsPage() {
  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Tools</h1>
      <p className="text-neutral-300">Calculators and utilities for planning your runs.</p>
      <ul className="space-y-2">
        <li className="rounded border border-neutral-800 p-4 hover:border-amber-600">
          <Link href="/tech" className="block">
            <span className="font-medium">Tech-tree cost calculator</span>
            <span className="block text-sm text-neutral-400">
              Total resources needed to unlock any technology.
            </span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
