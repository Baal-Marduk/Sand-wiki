import { loadTechGraph, listTechNodes, resourceNamesById } from "@/lib/queries";
import { calculateTotalCost } from "@/lib/tech-tree";
import { TechTreeGraph } from "@/components/TechTreeGraph";
import { TechTreeTable } from "@/components/TechTreeTable";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TechPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const targetSlug = Array.isArray(sp.target) ? sp.target[0] : sp.target;

  const [graph, nodes, resourceNames] = await Promise.all([
    loadTechGraph(), listTechNodes(), resourceNamesById(),
  ]);
  const idBySlug = new Map(nodes.map((n) => [n.slug, n.id]));
  const nameById = new Map(nodes.map((n) => [n.id, n.name]));

  let total: { resource: string; quantity: number }[] | null = null;
  let targetName: string | null = null;
  if (targetSlug && idBySlug.has(targetSlug)) {
    const targetId = idBySlug.get(targetSlug)!;
    targetName = nameById.get(targetId) ?? targetSlug;
    total = [...calculateTotalCost(graph, targetId)].map(([resourceId, quantity]) => ({
      resource: resourceNames.get(resourceId) ?? resourceId, quantity,
    }));
  }

  const graphInput = nodes.map((n) => ({
    id: n.id, name: n.name,
    prerequisiteIds: graph.get(n.id)?.prerequisiteIds ?? [],
  }));
  const tableRows = nodes.map((n) => ({
    slug: n.slug, name: n.name,
    prerequisites: (graph.get(n.id)?.prerequisiteIds ?? []).map((id) => nameById.get(id) ?? id),
  }));

  return (
    <section className="py-6 space-y-8">
      <h1 className="text-2xl font-bold">Tech Tree</h1>

      <TechTreeGraph nodes={graphInput} />

      <section>
        <h2 className="text-xl font-semibold mb-2">All technologies</h2>
        <TechTreeTable rows={tableRows} />
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Cost calculator</h2>
        <form action="/tech" method="get" className="flex gap-2 items-end mb-4">
          <div>
            <label htmlFor="target" className="block text-sm">Unlock technology</label>
            <select id="target" name="target" defaultValue={targetSlug ?? ""}
              className="rounded bg-neutral-900 border border-neutral-700 px-2 py-1">
              <option value="">Select…</option>
              {nodes.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
            </select>
          </div>
          <button type="submit" className="rounded bg-amber-600 text-neutral-950 font-medium px-4 py-2">
            Calculate
          </button>
        </form>

        {total && (
          <div aria-live="polite">
            <h3 className="font-medium mb-2">Total cost to unlock {targetName} (from scratch):</h3>
            {total.length === 0 ? (
              <p>No resource cost recorded.</p>
            ) : (
              <ul className="list-disc list-inside">
                {total.map((t) => <li key={t.resource}>{t.quantity} × {t.resource}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
