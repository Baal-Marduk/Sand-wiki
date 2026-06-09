import { getSection } from "@/lib/taxonomy";
import { notFound } from "next/navigation";

export function SectionPlaceholder({ sectionSlug }: { sectionSlug: string }) {
  const section = getSection(sectionSlug);
  if (!section) notFound();

  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">{section.label}</h1>
      <p className="rounded border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-amber-200">
        Coming soon — this section isn&apos;t available yet.
      </p>
      {section.categories.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Planned categories</h2>
          <ul className="list-disc list-inside text-neutral-300">
            {section.categories.map((c) => <li key={c.slug}>{c.label}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
