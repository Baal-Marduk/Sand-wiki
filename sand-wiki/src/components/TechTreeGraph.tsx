"use client";

import { useMemo } from "react";
import ReactFlow, { Background, type Edge, type Node } from "reactflow";
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
    // Decorative overview only. `inert` removes the whole React Flow subtree
    // (its tabbable nodes/edges and attribution link) from the tab order and the
    // accessibility tree — the keyboard/screen-reader path is the TechTreeTable.
    <div style={{ height: 420 }} className="rounded border border-neutral-800" inert>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        nodesFocusable={false}
        edgesFocusable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}
