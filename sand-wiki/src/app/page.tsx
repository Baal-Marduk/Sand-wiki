import { SearchBar } from "@/components/SearchBar";
import Link from "next/link";

export default function HomePage() {
  return (
    <section className="space-y-6 py-8">
      <h1 className="text-3xl font-bold">Unofficial SAND Wiki</h1>
      <p className="text-neutral-300 max-w-2xl">
        A community-built, unofficial database for crafting, items, and the tech tree of
        <em> SAND: Raiders of Sofia</em>.
      </p>
      <SearchBar />
      <p>
        Browse all <Link href="/items" className="underline">items</Link> or explore the{" "}
        <Link href="/tech" className="underline">tech tree</Link>.
      </p>
    </section>
  );
}
