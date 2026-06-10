import Link from "next/link";
import { notFound } from "next/navigation";
import { getEnvEntityBySlug } from "@/lib/queries";

type Params = Promise<{ slug: string }>;

export default async function EnvEntityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const entity = await getEnvEntityBySlug(slug);
  if (!entity) notFound();

  return (
    <article className="py-6 space-y-4 max-w-2xl">
      <p><Link href="/environment" className="btn btn-ghost btn-sm">← Environment</Link></p>
      <h1 className="font-display text-3xl font-bold">{entity.name}</h1>
      {entity.description &&
        entity.description.split(/\n+/).map((p, i) => (
          <p key={i} className="text-base-content/80">{p}</p>
        ))}
      {entity.sourceUrl && (
        <p className="text-sm text-base-content/60">
          Source:{" "}
          <a href={entity.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
            sandgame.wiki ↗
          </a>
        </p>
      )}
    </article>
  );
}
