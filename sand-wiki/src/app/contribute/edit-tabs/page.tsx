import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEditableTarget, entityHref } from "@/lib/proposal-schema";
import { getOutgoingLinks, getItemBySlug } from "@/lib/queries";
import { linksToSnapshot } from "@/lib/link-proposal";
import { linkFields, LINK_ROLES } from "@/lib/entity-links";
import { LinkEditForm } from "@/components/LinkEditForm";
import { submitDeleteRecipe } from "@/app/contribute/actions";
import { btnGhost, btnSecondary, btnDestructive, btnSm } from "@/components/form-styles";

type SP = Promise<{ type?: string; slug?: string }>;

/** Kinds whose pages render recipe (Crafted-by / Used-in) tabs. Landmark crafting
 *  later adds "environment" here; no other hub change is needed. */
const RECIPE_TAB_KINDS = new Set(["item"]);

/** Which link role (if any) this proposal target type edits via the inline editor. */
const ROLE_FOR_TYPE: Record<string, "loot" | "cost" | undefined> = {
  envEntity: "loot",
  tramplerPart: "cost",
  item: undefined, // recipes only (rendered via the recipe sections below)
};

export default async function EditTabsPage({ searchParams }: { searchParams: SP }) {
  const { type = "", slug = "" } = await searchParams;
  if (!isEditableTarget(type) || !slug) notFound();
  await requireUser(`/contribute/edit-tabs?type=${type}&slug=${slug}`);

  const role = ROLE_FOR_TYPE[type];
  const back = entityHref(type, slug);

  const entity = await getOutgoingLinks(slug, role ?? "loot");
  if (!entity) notFound();

  const items = role
    ? await prisma.entity.findMany({
        where: { kind: "item" },
        select: { slug: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const showRecipes = RECIPE_TAB_KINDS.has(entity.kind);
  const item = showRecipes ? await getItemBySlug(slug) : null;

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

      {showRecipes && item && (
        <>
          {(["craftedBy", "usedIn"] as const).map((key) => {
            const recipes = item[key];
            const side = key === "craftedBy" ? "output" : "input";
            const heading = key === "craftedBy" ? "Crafted by" : "Used in";
            return (
              <section key={key} className="space-y-3 border border-border bg-card p-4">
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{heading}</h2>
                {recipes.length === 0 && <p className="text-sm text-muted-foreground">No recipes yet.</p>}
                <ul className="space-y-2">
                  {recipes.map((r) => (
                    <li key={r.slug} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 text-sm">{r.workbench ?? "Recipe"}{r.tier != null ? ` · T${r.tier}` : ""}</span>
                      <Link href={`/contribute/edit-recipe?slug=${r.slug}`} className={`${btnGhost} ${btnSm}`}>Edit</Link>
                      <form action={submitDeleteRecipe} className="inline">
                        <input type="hidden" name="slug" value={r.slug} />
                        <input type="hidden" name="backType" value={type} />
                        <input type="hidden" name="backSlug" value={slug} />
                        <button type="submit" className={`${btnDestructive} ${btnSm}`}>Delete</button>
                      </form>
                    </li>
                  ))}
                </ul>
                <Link href={`/contribute/new-recipe?type=${type}&slug=${slug}&side=${side}`} className={`${btnSecondary} ${btnSm}`}>
                  + Propose a new recipe that {key === "craftedBy" ? "crafts" : "uses"} this
                </Link>
              </section>
            );
          })}
          <p className="text-sm text-muted-foreground">
            Ammo / Used-by tabs are derived from this item&apos;s ammo &amp; category fields — edit those via &ldquo;Suggest a correction&rdquo;.
          </p>
        </>
      )}

      <Link href={back} className={btnGhost}>Back to page</Link>
    </article>
  );
}
