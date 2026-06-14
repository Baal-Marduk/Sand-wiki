import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEditableTarget, entityHref } from "@/lib/proposal-schema";
import { getOutgoingLinks } from "@/lib/queries";
import { linksToSnapshot } from "@/lib/link-proposal";
import { linkFields, LINK_ROLES } from "@/lib/entity-links";
import { LinkEditForm } from "@/components/LinkEditForm";
import { btnGhost } from "@/components/form-styles";

type SP = Promise<{ type?: string; slug?: string }>;

/** Which link role (if any) this proposal target type edits via the inline editor. */
const ROLE_FOR_TYPE: Record<string, "loot" | "cost" | undefined> = {
  envEntity: "loot",
  tramplerPart: "cost",
  item: undefined, // recipes only (added in a later task)
};

export default async function EditTabsPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit-tabs?type=${type}&slug=${slug}`);

  const role = ROLE_FOR_TYPE[type];
  const back = entityHref(type, slug);

  const entity = await getOutgoingLinks(slug, role ?? "loot");
  if (!entity) notFound();

  const items = await prisma.entity.findMany({
    where: { kind: "item" },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Edit tabs — {entity.name}</h1>
      <p className="text-muted-foreground">An admin reviews every change before it goes live.</p>

      {role ? (
        <section className="space-y-3 border border-border bg-card p-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{LINK_ROLES[role].label}</h2>
          <LinkEditForm
            type={type}
            slug={slug}
            role={role}
            label={LINK_ROLES[role].label}
            fields={linkFields(role)}
            rows={linksToSnapshot(role, entity.outgoingLinks).rows}
            items={items}
          />
        </section>
      ) : (
        <p className="text-muted-foreground">No editable tabs for this entity yet.</p>
      )}

      <Link href={back} className={btnGhost}>Back to page</Link>
    </article>
  );
}
