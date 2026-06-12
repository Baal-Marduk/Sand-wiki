import { Fragment } from "react";
import { parseDescription, collectSlugs } from "@/lib/description-links";
import { getLinkTargetsBySlugs } from "@/lib/queries";
import { WikiLink } from "@/components/WikiLink";

/** Renders a description as paragraphs, turning resolved [[slug]] links (to any
 *  wiki entity) into WikiLinks. Unresolved slugs render as plain text. */
export async function DescriptionText({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  if (paragraphs.length === 0) return null;
  const parsed = paragraphs.map(parseDescription);
  const slugs = [...new Set(parsed.flatMap(collectSlugs))];
  const targets = await getLinkTargetsBySlugs(slugs);

  return (
    <>
      {parsed.map((segments, i) => (
        <p key={i} className="text-base-content/80 max-w-prose">
          {segments.map((s, j) => {
            if (s.type === "text") return <Fragment key={j}>{s.value}</Fragment>;
            const target = targets.get(s.slug);
            if (!target) return <Fragment key={j}>{s.label ?? s.slug}</Fragment>;
            return <WikiLink key={j} href={target.href} label={s.label ?? target.name} rarity={target.rarity} />;
          })}
        </p>
      ))}
    </>
  );
}
