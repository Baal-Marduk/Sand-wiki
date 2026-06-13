import { getSection } from "@/lib/taxonomy";
import { notFound } from "next/navigation";

export function SectionPlaceholder({ sectionSlug, note }: { sectionSlug: string; note?: string }) {
  const section = getSection(sectionSlug);
  if (!section) notFound();

  return (
    <section className="mx-auto max-w-2xl space-y-4 py-8">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">{section.label}</h1>
      <div role="alert" className="border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        {note ?? "Coming soon — this section isn't available yet."}
      </div>
      {section.categories.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Planned categories
          </h2>
          <div className="flex flex-wrap gap-2">
            {section.categories.map((c) => (
              <span
                key={c.slug}
                className="border border-border-strong bg-card-elevated px-2.5 py-1 font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground"
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
