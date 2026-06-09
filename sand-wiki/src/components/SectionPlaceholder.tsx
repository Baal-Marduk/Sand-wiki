import { getSection } from "@/lib/taxonomy";
import { notFound } from "next/navigation";

export function SectionPlaceholder({ sectionSlug, note }: { sectionSlug: string; note?: string }) {
  const section = getSection(sectionSlug);
  if (!section) notFound();

  return (
    <section className="py-8 space-y-4 max-w-2xl">
      <h1 className="font-display text-2xl font-bold">{section.label}</h1>
      <div role="alert" className="alert alert-warning">
        <span>{note ?? "Coming soon — this section isn't available yet."}</span>
      </div>
      {section.categories.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-semibold mb-2">Planned categories</h2>
          <div className="flex flex-wrap gap-2">
            {section.categories.map((c) => <span key={c.slug} className="badge badge-outline badge-lg">{c.label}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}
