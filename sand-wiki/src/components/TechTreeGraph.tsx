"use client";

import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";

export interface GraphNodeInput { id: string; name: string; prerequisiteIds: string[] }

export function TechTreeGraph({ nodes }: { nodes: GraphNodeInput[] }) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const rfNodes: Node[] = nodes.map((n, i) => ({
      id: n.id,
      position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 120 },
      data: { label: n.name },
    }));
    const rfEdges: Edge[] = nodes.flatMap((n) =>
      n.prerequisiteIds.map((p) => ({ id: `${p}->${n.id}`, source: p, target: n.id })),
    );
    return { rfNodes, rfEdges };
  }, [nodes]);

  return (
    <div style={{ height: 420 }} className="rounded border border-neutral-800" aria-hidden="true">
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
