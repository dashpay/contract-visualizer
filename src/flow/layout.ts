// elk layered auto-layout for the entity nodes. Runs in-thread via the bundled
// elk build (no separate worker file needed — good for static hosting).

import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import { NODE_WIDTH } from './diagramToFlow';

const elk = new ELK();

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.spacing.nodeNode': '60',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
};

export async function layoutNodes<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
): Promise<Node<T>[]> {
  if (nodes.length === 0) return nodes;

  const graph = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width ?? NODE_WIDTH,
      height: n.height ?? 120,
    })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const result = await elk.layout(graph);
  const pos = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));

  return nodes.map((n) => {
    const p = pos.get(n.id);
    return p ? { ...n, position: { x: p.x, y: p.y } } : n;
  });
}
