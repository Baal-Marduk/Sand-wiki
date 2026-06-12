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
    <article className="py-6 space-y-4">
      <h1 className="font-display text-2xl font-bold">Pending proposals ({pending.length})</h1>
      {pending.length === 0 ? (
        <p className="text-base-content/70">Nothing to review.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((p) => (
            <li key={p.id} className="rounded-box border border-base-300 p-3">
              <Link href={`/admin/proposals/${p.id}`} className="link">
                {p.kind === "edit" ? `Edit · ${p.targetType} · ${p.targetSlug}` : `New page · ${p.proposedName}`}
              </Link>
              <span className="ml-2 text-sm text-base-content/60">by {p.proposer.personaName ?? p.proposerId}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
