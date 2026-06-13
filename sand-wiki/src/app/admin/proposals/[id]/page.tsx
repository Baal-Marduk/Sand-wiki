import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEntityFields } from "@/lib/proposal-entity";
import { detectStale } from "@/lib/proposal-apply";
import type { Diff } from "@/lib/proposal-diff";
import { recipeToSnapshot, snapshotsEqual, diffRecipeLines, type RecipeProposalChange } from "@/lib/recipe-proposal";
import { approveProposal, rejectProposal } from "../actions";

type Params = Promise<{ id: string }>;

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

  return (
    <article className="py-6 space-y-6 max-w-3xl">
      <h1 className="font-display text-2xl font-bold">
        {p.kind === "edit"
          ? `Edit · ${p.targetType} · ${p.targetSlug}`
          : p.kind === "recipe_edit"
            ? `Recipe edit · ${p.targetSlug}`
            : `New page · ${p.proposedName}`}
      </h1>
      <p className="text-sm text-base-content/60">by {p.proposer.personaName ?? p.proposerId} · {p.status}</p>

      {p.kind === "edit" && diff ? (
        <table className="table">
          <thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>
            {Object.entries(diff).map(([field, c]) => (
              <tr key={field} className={stale.includes(field) ? "bg-warning/20" : ""}>
                <td>{field}{stale.includes(field) && <span className="badge badge-warning badge-sm ml-2">base changed</span>}</td>
                <td>{String(current[field] ?? "—")}</td>
                <td className="font-medium">{String(c.new ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : p.kind === "recipe_edit" && recipeChange ? (
        <div className="space-y-4">
          {recipeStale && <div className="alert alert-warning">The recipe changed since this was proposed (base changed).</div>}
          <table className="table">
            <thead><tr><th>Meta</th><th>Current</th><th>Proposed</th></tr></thead>
            <tbody>
              {(["workbench", "tier", "craftTimeSeconds"] as const).map((k) => (
                <tr key={k} className={recipeChange!.old[k] !== recipeChange!.new[k] ? "bg-warning/20" : ""}>
                  <td>{k}</td>
                  <td>{String(recipeChange!.old[k] ?? "—")}</td>
                  <td className="font-medium">{String(recipeChange!.new[k] ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(["inputs", "outputs"] as const).map((side) => (
            <div key={side}>
              <h2 className="font-display text-lg font-semibold capitalize">{side}</h2>
              <table className="table">
                <thead><tr><th>Item</th><th>Current</th><th>Proposed</th></tr></thead>
                <tbody>
                  {diffRecipeLines(recipeChange!.old[side], recipeChange!.new[side]).map((row) => (
                    <tr key={row.slug} className={row.status === "same" ? "" : "bg-warning/20"}>
                      <td>{row.name}{row.status !== "same" && <span className="badge badge-sm ml-2">{row.status}</span>}</td>
                      <td>{row.oldAmount ?? "—"}</td>
                      <td className="font-medium">{row.newAmount ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="whitespace-pre-wrap rounded-box border border-base-300 p-3">{p.note}</div>
      )}

      {p.note && (p.kind === "edit" || p.kind === "recipe_edit") && <p className="text-base-content/80"><strong>Note:</strong> {p.note}</p>}

      {p.status === "pending" && (
        <div className="flex flex-wrap gap-4 items-start">
          <form action={approveProposal}>
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="btn btn-success">
              {p.kind === "new_page" ? "Mark created" : "Approve & apply"}
            </button>
          </form>
          <form action={rejectProposal} className="flex gap-2 items-end">
            <input type="hidden" name="id" value={p.id} />
            <input name="reviewNote" placeholder="Reason (optional)" className="input input-bordered input-sm" />
            <button type="submit" className="btn btn-error">Reject</button>
          </form>
        </div>
      )}
    </article>
  );
}
