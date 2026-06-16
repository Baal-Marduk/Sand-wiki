import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AdminProposalsPage() {
  await requireAdmin();
  const pending = await prisma.proposal.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { proposer: true },
  });

  return (
    <article className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.01em]">Proposals queue</h1>
        <div className="flex items-baseline gap-3">
          <Link href="/admin/entities/new" className="border border-border-strong px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.05em] hover:border-primary hover:text-primary-hover">
            Add entity
          </Link>
          <span className="inline-flex items-center gap-1.5 border border-warning/40 bg-card-elevated px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-warning">
            <span className="size-[7px] bg-warning" aria-hidden="true" />
            {pending.length} pending
          </span>
        </div>
      </div>
      {pending.length === 0 ? (
        <p className="text-muted-foreground">Nothing to review.</p>
      ) : (
        <ul className="divide-y divide-border border border-border bg-card">
          {pending.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/proposals/${p.id}`}
                className="flex items-baseline justify-between gap-3 px-4 py-3 transition-colors hover:bg-card-elevated"
              >
                <span className="font-medium text-foreground">
                  {p.kind === "edit"
                    ? `Edit · ${p.targetType} · ${p.targetSlug}`
                    : p.kind === "recipe_edit"
                      ? `Recipe edit · ${p.targetSlug}`
                      : p.kind === "links_edit"
                        ? `Tab edit · ${p.targetType} · ${p.targetSlug}`
                        : p.kind === "loot_sources_edit"
                          ? `Loot sources · ${p.targetType} · ${p.targetSlug}`
                          : p.kind === "buy_options_edit"
                            ? `Buy options · ${p.targetType} · ${p.targetSlug}`
                            : p.kind === "recipe_new"
                              ? `New recipe`
                              : p.kind === "recipe_delete"
                                ? `Delete recipe · ${p.targetSlug}`
                                : `New page · ${p.proposedName}`}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  by {p.proposer.personaName ?? p.proposerId}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
