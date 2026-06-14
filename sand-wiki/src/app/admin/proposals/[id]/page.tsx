import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEntityFields } from "@/lib/proposal-entity";
import { detectStale } from "@/lib/proposal-apply";
import type { Diff } from "@/lib/proposal-diff";
import { recipeToSnapshot, snapshotsEqual, diffRecipeLines, type RecipeProposalChange } from "@/lib/recipe-proposal";
import { diffLinkRows, type LinkProposalChange } from "@/lib/link-proposal";
import { approveProposal, rejectProposal } from "../actions";
import { inputCls, btnSuccess, btnDestructive } from "@/components/form-styles";

type Params = Promise<{ id: string }>;

const tableCls = "w-full border-collapse border border-border text-[13px]";
const thCls =
  "border-b border-border-strong bg-card-elevated px-3 py-2 text-left font-display text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground";
const tdCls = "border-b border-border px-3 py-2 text-foreground";
const tagWarn =
  "ml-2 inline-flex items-center border border-warning/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.04em] text-warning";

export default async function ProposalDetail({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const p = await prisma.proposal.findUnique({ where: { id }, include: { proposer: true } });
  if (!p) notFound();

  let stale: string[] = [];
  let diff: Diff | null = null;
  let current: Record<string, string | number | null> = {};
  if (p.kind === "edit" && p.targetType && p.targetSlug && p.changes) {
    diff = p.changes as unknown as Diff;
    const ent = await getEntityFields(p.targetType, p.targetSlug);
    current = ent?.values ?? {};
    stale = detectStale(diff, current);
  }

  let recipeChange: RecipeProposalChange | null = null;
  let recipeStale = false;
  if (p.kind === "recipe_edit" && p.targetSlug && p.changes) {
    recipeChange = p.changes as unknown as RecipeProposalChange;
    const live = await prisma.recipe.findUnique({
      where: { slug: p.targetSlug },
      include: {
        inputs: { include: { entity: { select: { slug: true, name: true } } } },
        outputs: { include: { entity: { select: { slug: true, name: true } } } },
      },
    });
    recipeStale = !live || !snapshotsEqual(recipeChange.old, recipeToSnapshot(live));
  }

  let linkChange: LinkProposalChange | null = null;
  if ((p.kind === "links_edit" || p.kind === "loot_sources_edit") && p.changes) {
    linkChange = p.changes as unknown as LinkProposalChange;
  }

  // recipe_new shows everything as added (old = empty); recipe_delete shows everything as removed (new = empty).
  let recipeNewOrDelete: { old: RecipeProposalChange["old"]; new: RecipeProposalChange["new"] } | null = null;
  if (p.kind === "recipe_new" && p.changes) {
    const snap = (p.changes as unknown as { new: RecipeProposalChange["new"] }).new;
    recipeNewOrDelete = { old: { workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] }, new: snap };
  }
  if (p.kind === "recipe_delete" && p.changes) {
    const snap = (p.changes as unknown as { old: RecipeProposalChange["old"] }).old;
    recipeNewOrDelete = { old: snap, new: { workbench: null, tier: null, craftTimeSeconds: null, inputs: [], outputs: [] } };
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">
          {p.kind === "edit"
            ? `Edit · ${p.targetType} · ${p.targetSlug}`
            : p.kind === "recipe_edit"
              ? `Recipe edit · ${p.targetSlug}`
              : p.kind === "links_edit"
                ? `Tab edit · ${p.targetType} · ${p.targetSlug}`
                : p.kind === "loot_sources_edit"
                  ? `Loot sources · ${p.targetType} · ${p.targetSlug}`
                  : p.kind === "recipe_new"
                    ? `New recipe`
                    : p.kind === "recipe_delete"
                      ? `Delete recipe · ${p.targetSlug}`
                      : `New page · ${p.proposedName}`}
        </h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.04em] text-muted-foreground">
          by {p.proposer.personaName ?? p.proposerId} · {p.status}
        </p>
      </div>

      {p.kind === "edit" && diff ? (
        <table className={tableCls}>
          <thead><tr><th className={thCls}>Field</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
          <tbody>
            {Object.entries(diff).map(([field, c]) => (
              <tr key={field} className={stale.includes(field) ? "bg-warning/10" : ""}>
                <td className={tdCls}>{field}{stale.includes(field) && <span className={tagWarn}>base changed</span>}</td>
                <td className={`${tdCls} text-muted-foreground`}>{String(current[field] ?? "—")}</td>
                <td className={`${tdCls} font-medium`}>{String(c.new ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : p.kind === "recipe_edit" && recipeChange ? (
        <div className="space-y-4">
          {recipeStale && (
            <div className="border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              The recipe changed since this was proposed (base changed).
            </div>
          )}
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Meta</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
            <tbody>
              {(["workbench", "tier", "craftTimeSeconds"] as const).map((k) => (
                <tr key={k} className={recipeChange!.old[k] !== recipeChange!.new[k] ? "bg-warning/10" : ""}>
                  <td className={tdCls}>{k}</td>
                  <td className={`${tdCls} text-muted-foreground`}>{String(recipeChange!.old[k] ?? "—")}</td>
                  <td className={`${tdCls} font-medium`}>{String(recipeChange!.new[k] ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(["inputs", "outputs"] as const).map((side) => (
            <div key={side}>
              <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{side}</h2>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Item</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
                <tbody>
                  {diffRecipeLines(recipeChange!.old[side], recipeChange!.new[side]).map((row) => (
                    <tr key={row.slug} className={row.status === "same" ? "" : "bg-warning/10"}>
                      <td className={tdCls}>{row.name}{row.status !== "same" && <span className={tagWarn}>{row.status}</span>}</td>
                      <td className={`${tdCls} text-muted-foreground`}>{row.oldAmount ?? "—"}</td>
                      <td className={`${tdCls} font-medium`}>{row.newAmount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (p.kind === "links_edit" || p.kind === "loot_sources_edit") && linkChange ? (
        <div className="space-y-2">
          <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{linkChange.role} rows</h2>
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Entity</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
            <tbody>
              {diffLinkRows(linkChange.old, linkChange.new).map((row) => {
                const fmt = (r: typeof row.old) =>
                  r ? [r.tier, r.amount != null ? `×${r.amount}` : null, r.value1].filter(Boolean).join(" ") || "—" : "—";
                return (
                  <tr key={row.key} className={row.status === "same" ? "" : "bg-warning/10"}>
                    <td className={tdCls}>{row.name}{row.status !== "same" && <span className={tagWarn}>{row.status}</span>}</td>
                    <td className={`${tdCls} text-muted-foreground`}>{fmt(row.old)}</td>
                    <td className={`${tdCls} font-medium`}>{fmt(row.new)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (p.kind === "recipe_new" || p.kind === "recipe_delete") && recipeNewOrDelete ? (
        <div className="space-y-4">
          <table className={tableCls}>
            <thead><tr><th className={thCls}>Meta</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
            <tbody>
              {(["workbench", "tier", "craftTimeSeconds"] as const).map((k) => (
                <tr key={k}>
                  <td className={tdCls}>{k}</td>
                  <td className={`${tdCls} text-muted-foreground`}>{String(recipeNewOrDelete!.old[k] ?? "—")}</td>
                  <td className={`${tdCls} font-medium`}>{String(recipeNewOrDelete!.new[k] ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(["inputs", "outputs"] as const).map((sideKey) => (
            <div key={sideKey}>
              <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">{sideKey}</h2>
              <table className={tableCls}>
                <thead><tr><th className={thCls}>Item</th><th className={thCls}>Current</th><th className={thCls}>Proposed</th></tr></thead>
                <tbody>
                  {diffRecipeLines(recipeNewOrDelete!.old[sideKey], recipeNewOrDelete!.new[sideKey]).map((row) => (
                    <tr key={row.slug} className={row.status === "same" ? "" : "bg-warning/10"}>
                      <td className={tdCls}>{row.name}{row.status !== "same" && <span className={tagWarn}>{row.status}</span>}</td>
                      <td className={`${tdCls} text-muted-foreground`}>{row.oldAmount ?? "—"}</td>
                      <td className={`${tdCls} font-medium`}>{row.newAmount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="whitespace-pre-wrap border border-border bg-card p-3 text-sm text-foreground">{p.note}</div>
      )}

      {p.note && p.kind !== "new_page" && (
        <p className="text-muted-foreground"><strong className="text-foreground">Note:</strong> {p.note}</p>
      )}

      {p.status === "pending" && (
        <div className="flex flex-wrap items-end gap-4 border-t border-border pt-4">
          <form action={approveProposal}>
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className={btnSuccess}>
              {p.kind === "new_page" ? "Mark created" : "Approve & apply"}
            </button>
          </form>
          <form action={rejectProposal} className="flex items-end gap-2">
            <input type="hidden" name="id" value={p.id} />
            <input name="reviewNote" placeholder="Reason (optional)" className={`${inputCls} w-auto`} />
            <button type="submit" className={btnDestructive}>Reject</button>
          </form>
        </div>
      )}
    </article>
  );
}
