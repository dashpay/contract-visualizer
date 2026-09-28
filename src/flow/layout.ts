// elk layered auto-layout for the diagram nodes. Runs in-thread via the bundled
// elk build (no separate worker file needed — good for static hosting).

import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import { NODE_WIDTH } from './diagramToFlow';

const elk = new ELK();

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '140',
  'elk.spacing.nodeNode': '50',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

export async function layoutNodes<N extends Node>(nodes: N[], edges: Edge[]): Promise<N[]> {
  if (nodes.length === 0) return nodes;

  const graph = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    // Prefer the measured size (after first paint) over the pre-paint estimate.
    children: nodes.map((n) => ({
      id: n.id,
      width: n.measured?.width ?? n.width ?? NODE_WIDTH,
      height: n.measured?.height ?? n.height ?? 120,
    })),
    edges: edges
      .filter((e) => e.source !== e.target)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const result = await elk.layout(graph);
  const pos = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));

  return nodes.map((n) => {
    const p = pos.get(n.id);
    return p ? { ...n, position: { x: p.x, y: p.y } } : n;
  });
}
