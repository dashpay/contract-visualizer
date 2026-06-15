// Map a ContractModel + view into React Flow nodes and edges.

import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { ViewKind } from '../config';
import type { ContractModel, Entity } from '../model/types';

export const NODE_WIDTH = 268;
const HEADER_H = 38;
const ROW_H = 20;
const INDEX_HEADER_H = 24;
const INDEX_ROW_H = 18;
const PAD = 12;

/** Estimate a node's rendered height so elk can lay it out before paint. */
export function estimateNodeHeight(entity: Entity): number {
  return (
    HEADER_H +
    entity.fields.length * ROW_H +
    (entity.indices.length > 0 ? INDEX_HEADER_H + entity.indices.length * INDEX_ROW_H : 0) +
    PAD
  );
}

export interface EntityNodeData extends Record<string, unknown> {
  entity: Entity;
  view: ViewKind;
}

function edgeLabel(view: ViewKind): string {
  // from = referencing (many), to = referenced (one)
  return view === 'merise' ? '(0,n) — (1,1)' : '∗ — 1';
}

export function toNodes(model: ContractModel, view: ViewKind): Node<EntityNodeData>[] {
  return model.entities.map((entity) => ({
    id: entity.name,
    type: 'entity',
    position: { x: 0, y: 0 }, // assigned by layout
    data: { entity, view },
    width: NODE_WIDTH,
    height: estimateNodeHeight(entity),
  }));
}

export function toEdges(model: ContractModel, view: ViewKind, hidden: Set<string>): Edge[] {
  return model.relationships
    .filter((rel) => !hidden.has(rel.id))
    .map((rel) => {
      const dashed = rel.confidence !== 'high';
      return {
        id: rel.id,
        source: rel.from,
        target: rel.to,
        type: 'smoothstep',
        label: edgeLabel(view),
        labelShowBg: true,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: {
          stroke: rel.confidence === 'low' ? 'var(--cv-edge-weak)' : 'var(--cv-edge)',
          strokeWidth: 1.5,
          strokeDasharray: dashed ? '5 4' : undefined,
        },
        data: { relationship: rel },
      } satisfies Edge;
    });
}
