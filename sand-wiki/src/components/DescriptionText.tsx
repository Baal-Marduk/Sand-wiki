import { Fragment } from "react";
import { parseDescription, collectSlugs } from "@/lib/description-links";
import { getItemsBySlugs } from "@/lib/queries";
import { ItemTextLink } from "@/components/ItemTextLink";

/** Renders a description as paragraphs, turning resolved [[slug]] links into
 *  ItemTextLinks. Unresolved slugs render as plain text. */
export async function DescriptionText({ text }: { text: string }) {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  if (paragraphs.length === 0) return null;
  const parsed = paragraphs.map(parseDescription);
  const slugs = [...new Set(parsed.flatMap(collectSlugs))];
  const items = await getItemsBySlugs(slugs);

  return (
    <>
      {parsed.map((segments, i) => (
        <p key={i} className="text-base-content/80 max-w-prose">
          {segments.map((s, j) => {
            if (s.type === "text") return <Fragment key={j}>{s.value}</Fragment>;
            const item = items.get(s.slug);
            if (!item) return <Fragment key={j}>{s.label ?? s.slug}</Fragment>;
            return <ItemTextLink key={j} slug={item.slug} label={s.label ?? item.name} rarity={item.rarity} />;
          })}
        </p>
      ))}
    </>
  );
}
