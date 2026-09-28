// Map a ContractModel + view into React Flow nodes and edges.

import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { ViewKind } from '../config';
import { documentTypeChips, refKind, type RefKind } from '../model/describe';
import type { ContractModel, Entity, ExternalNode, Relationship } from '../model/types';
import type { ChangeKind, ContractDiff } from '../model/diff';

export const NODE_WIDTH = 300;
export const EXTERNAL_WIDTH = 190;
const HEADER_H = 38;
const CHIP_ROW_H = 22;
const ROW_H = 21;
const SECTION_HEAD_H = 24;
const INDEX_ROW_H = 20;
const PAD = 12;

export interface Filters {
  declared: boolean;
  inferred: boolean;
  /** Identity / contract / token / key nodes (other contracts' document types always show). */
  platform: boolean;
  /** Compare mode: only document types with a change (and what their edges reach). */
  onlyChanged: boolean;
}

export const DEFAULT_FILTERS: Filters = { declared: true, inferred: true, platform: true, onlyChanged: false };

/** Compare mode: the status of one document type and its parts. */
export interface EntityDiff {
  status?: ChangeKind;
  fields: Record<string, ChangeKind>;
  indices: Record<string, ChangeKind>;
  rules: Record<string, ChangeKind>;
  /** Parts a platform update would refuse: 'type', 'field:<path>', 'index:<name>', 'rule:<name>'. */
  refused: string[];
}

export function entityDiff(diff: ContractDiff, name: string): EntityDiff {
  const pick = (m: Record<string, ChangeKind>) => {
    const out: Record<string, ChangeKind> = {};
    const prefix = `${name}::`;
    for (const [k, v] of Object.entries(m)) if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
    return out;
  };
  const refused: string[] = [];
  for (const r of diff.status.refused) {
    if (r === `type:${name}`) refused.push('type');
    else {
      const m = r.match(/^(field|index|rule):(.*?)::(.*)$/);
      if (m && m[2] === name) refused.push(`${m[1]}:${m[3]}`);
    }
  }
  return {
    status: diff.status.entities[name],
    fields: pick(diff.status.fields),
    indices: pick(diff.status.indices),
    rules: pick(diff.status.rules),
    refused,
  };
}

/** Estimate a node's rendered height so elk can lay it out before paint (re-laid out once measured). */
export function estimateNodeHeight(entity: Entity): number {
  const chips = documentTypeChips(entity).length;
  const constraints = Object.keys(entity.propertyConstraints).length;
  return (
    HEADER_H +
    (chips ? Math.ceil(chips / 3) * CHIP_ROW_H : 0) +
    entity.fields.length * ROW_H +
    (entity.indices.length ? SECTION_HEAD_H + entity.indices.length * INDEX_ROW_H * 1.4 : 0) +
    (constraints ? SECTION_HEAD_H + constraints * INDEX_ROW_H * 1.6 : 0) +
    PAD
  );
}

export interface EntityNodeData extends Record<string, unknown> {
  entity: Entity;
  view: ViewKind;
  /** Field paths an edge leaves from (each gets a source handle). */
  sources: string[];
  /** Field paths an edge ends on (each gets a target handle). */
  targets: string[];
  /** Kind of the outgoing reference per field path, for the row marker colour. */
  refKinds: Record<string, RefKind>;
  /** Compare mode only. */
  diff?: EntityDiff;
}

export interface ExternalNodeData extends Record<string, unknown> {
  node: ExternalNode;
  incoming: number;
  status?: ChangeKind;
}

export type DiagramNode = Node<EntityNodeData> | Node<ExternalNodeData>;

const localEntity = (model: ContractModel, id: string) => model.entities.some((e) => e.name === id);

export function relKind(model: ContractModel, rel: Relationship): RefKind | 'inferred' {
  if (rel.kind === 'inferred' || !rel.target) return 'inferred';
  return refKind(rel.target, localEntity(model, rel.to));
}

function isPlatformNode(id: string): boolean {
  return id.startsWith('platform:');
}

/** Document types shown: all, or in compare mode with onlyChanged, the changed ones. */
function shownEntities(model: ContractModel, filters: Filters, diff?: ContractDiff): Set<string> {
  const names = model.entities.map((e) => e.name);
  if (!diff || !filters.onlyChanged) return new Set(names);
  return new Set(names.filter((n) => diff.status.entities[n]));
}

export function visibleRelationships(
  model: ContractModel,
  hidden: Set<string>,
  filters: Filters,
  diff?: ContractDiff,
): Relationship[] {
  const shown = shownEntities(model, filters, diff);
  const isEntity = new Set(model.entities.map((e) => e.name));
  return model.relationships.filter((rel) => {
    if (hidden.has(rel.id)) return false;
    if (rel.kind === 'declared' && !filters.declared) return false;
    if (rel.kind === 'inferred' && !filters.inferred) return false;
    if (!filters.platform && isPlatformNode(rel.to)) return false;
    if (!shown.has(rel.from)) return false;
    if (isEntity.has(rel.to) && !shown.has(rel.to)) return false;
    return true;
  });
}

/** Which end of the target an edge lands on: a field row when it names one, else the header. */
function targetPath(model: ContractModel, rel: Relationship): string | undefined {
  const entity = model.entities.find((e) => e.name === rel.to);
  if (!entity) return undefined;
  const candidate = rel.target?.inList ?? (rel.kind === 'inferred' ? rel.toField : undefined);
  return candidate && entity.fields.some((f) => f.path === candidate) ? candidate : undefined;
}

function multiplicity(rel: Relationship, view: ViewKind): string {
  if (rel.site === 'owner' || rel.site === 'creator') {
    return view === 'merise' ? `(1,1) ${rel.site}` : `«${rel.site}»`;
  }
  if (rel.site === 'element') return view === 'merise' ? '(0,n)' : '0..∗';
  if (rel.optional) return view === 'merise' ? '(0,1)' : '0..1';
  return view === 'merise' ? '(1,1)' : '1';
}

export function edgeLabel(rel: Relationship, view: ViewKind): string {
  if (rel.kind === 'inferred') return view === 'merise' ? '(0,n) — (1,1) ?' : 'inferred';
  const t = rel.target;
  const parts = [multiplicity(rel, view)];
  if (t?.lookup) parts.push(`via ${t.lookup.index}`);
  else if (t?.inList) parts.push(`∈ ${t.inList}`);
  else if (t?.type === 'identityPublicKey') parts.push(`${t.keyRequirements?.purpose ?? ''} key`.trim());
  if (t?.type === 'deletableDocument') parts.push('deletable');
  if (rel.expression) parts.push(`${rel.expression.op} ${rel.expression.branch}/${rel.expression.of}`);
  return parts.join(' · ');
}

const KIND_VAR: Record<RefKind | 'inferred', string> = {
  document: 'var(--ref-document)',
  external: 'var(--ref-external)',
  identity: 'var(--ref-identity)',
  contract: 'var(--ref-contract)',
  token: 'var(--ref-token)',
  key: 'var(--ref-key)',
  inferred: 'var(--cv-edge)',
};

export function kindColor(kind: RefKind | 'inferred'): string {
  return KIND_VAR[kind];
}

const STATUS_STROKE: Record<ChangeKind, string> = {
  added: 'var(--diff-added)',
  removed: 'var(--diff-removed)',
  changed: 'var(--diff-changed)',
};

export function toEdges(
  model: ContractModel,
  view: ViewKind,
  hidden: Set<string>,
  filters: Filters,
  diff?: ContractDiff,
): Edge[] {
  return visibleRelationships(model, hidden, filters, diff).map((rel) => {
    const kind = relKind(model, rel);
    const status = diff?.status.relationships[rel.id];
    const stroke = status
      ? STATUS_STROKE[status]
      : kind === 'inferred' && rel.confidence === 'low'
        ? 'var(--cv-edge-weak)'
        : kindColor(kind);
    const tp = targetPath(model, rel);
    const label = edgeLabel(rel, view);
    return {
      id: rel.id,
      source: rel.from,
      target: rel.to,
      sourceHandle: `out:${rel.fromField}`,
      targetHandle: tp ? `in:${tp}` : 'in',
      type: 'smoothstep',
      label: status === 'added' ? `+ ${label}` : status === 'removed' ? `− ${label}` : label,
      labelShowBg: true,
      labelStyle: { fill: kind === 'inferred' && !status ? 'var(--text-muted)' : stroke },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: stroke },
      style: {
        stroke,
        strokeWidth: status ? 2.2 : kind === 'inferred' ? 1.3 : 1.7,
        strokeDasharray: status === 'removed' ? '6 4' : kind === 'inferred' ? '5 4' : undefined,
        opacity: diff && !status ? 0.55 : undefined,
      },
      data: { relationship: rel },
    } satisfies Edge;
  });
}

export function toNodes(model: ContractModel, view: ViewKind, edges: Edge[], diff?: ContractDiff, filters: Filters = DEFAULT_FILTERS): DiagramNode[] {
  const shown = shownEntities(model, filters, diff);
  const sources = new Map<string, Set<string>>();
  const targets = new Map<string, Set<string>>();
  const incoming = new Map<string, number>();
  for (const e of edges) {
    const rel = (e.data as { relationship: Relationship }).relationship;
    if (!sources.has(e.source)) sources.set(e.source, new Set());
    sources.get(e.source)!.add(rel.fromField);
    const th = e.targetHandle?.startsWith('in:') ? e.targetHandle.slice(3) : undefined;
    if (th) {
      if (!targets.has(e.target)) targets.set(e.target, new Set());
      targets.get(e.target)!.add(th);
    }
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }

  const entityNodes: Node<EntityNodeData>[] = model.entities.filter((e) => shown.has(e.name)).map((entity) => {
    const refKinds: Record<string, RefKind> = {};
    for (const rel of model.relationships) {
      if (rel.from === entity.name && rel.kind === 'declared') {
        const k = relKind(model, rel);
        if (k !== 'inferred' && !refKinds[rel.fromField]) refKinds[rel.fromField] = k;
      }
    }
    return {
      id: entity.name,
      type: 'entity',
      position: { x: 0, y: 0 }, // assigned by layout
      data: {
        entity,
        view,
        sources: [...(sources.get(entity.name) ?? [])],
        targets: [...(targets.get(entity.name) ?? [])],
        refKinds,
        diff: diff ? entityDiff(diff, entity.name) : undefined,
      },
      width: NODE_WIDTH,
      height: estimateNodeHeight(entity),
    };
  });

  // External nodes only when some visible edge reaches them.
  const reached = new Set(edges.map((e) => e.target));
  const externalNodes: Node<ExternalNodeData>[] = model.externals
    .filter((n) => reached.has(n.id))
    .map((node) => ({
      id: node.id,
      type: 'external',
      position: { x: 0, y: 0 },
      data: {
        node,
        incoming: incoming.get(node.id) ?? 0,
        status: diff && !diff.head.externals.some((n) => n.id === node.id)
          ? 'removed'
          : diff && !diff.base.externals.some((n) => n.id === node.id)
            ? 'added'
            : undefined,
      },
      width: EXTERNAL_WIDTH,
      height: node.kind === 'externalDocument' ? 70 : 52,
    }));

  return [...entityNodes, ...externalNodes];
}
