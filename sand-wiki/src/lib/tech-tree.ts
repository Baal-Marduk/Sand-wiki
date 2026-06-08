export interface TechCostEntry {
  resourceId: string;
  quantity: number;
}

export interface TechNodeGraph {
  id: string;
  costs: TechCostEntry[];
  prerequisiteIds: string[];
}

export type TechGraph = Map<string, TechNodeGraph>;

/** Target node plus every transitive prerequisite, deduplicated and cycle-safe. */
export function collectPrerequisites(graph: TechGraph, targetId: string): Set<string> {
  const visited = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (visited.has(id)) continue;
    const node = graph.get(id);
    if (!node) throw new Error(`Unknown tech node: ${id}`);
    visited.add(id);
    for (const prereq of node.prerequisiteIds) stack.push(prereq);
  }
  return visited;
}

/** Total resource cost to unlock target from scratch, grouped by resourceId. */
export function calculateTotalCost(graph: TechGraph, targetId: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const id of collectPrerequisites(graph, targetId)) {
    const node = graph.get(id) as TechNodeGraph;
    for (const { resourceId, quantity } of node.costs) {
      totals.set(resourceId, (totals.get(resourceId) ?? 0) + quantity);
    }
  }
  return totals;
}
