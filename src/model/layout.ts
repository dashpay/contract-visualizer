// The GroveDB layout of a document type, as `documentTypeLayout` in
// @dashevo/evo-sdk returns it (computed by Drive, platform #5153), and the
// helpers the layout panel draws it with.

import { compactNumber } from './describe';

export interface LayoutKey {
  kind: 'fixed' | 'documentId' | 'revisionTime' | 'propertyValue' | 'timeRangeBucket' | 'integerRangeBucket' | 'memberKey';
  hex?: string;
  label?: string;
  property?: string;
  rangeSeconds?: number;
  stepSeconds?: number;
  phaseSeconds?: number;
  /** integerRangeBucket: the window length, the distance between starts and the shift, in the property's units. */
  range?: number;
  step?: number;
  phase?: number;
  components?: string[];
}

export interface LayoutNode {
  key: LayoutKey;
  role: string;
  /** The node of Drive's structure description this layer is an instance of. */
  structureNode: string;
  element: string;
  /** Left out when the tree is not wrapped. */
  wrapper?: string;
  rankedAxes: string[];
  indexes: string[];
  notes: Array<{ code: string; text: string }>;
  /** Left out when there is none. */
  alternative?: { when: string; node: LayoutNode };
  children: LayoutNode[];
}

export interface DocumentTypeLayout {
  documentType: string;
  root: LayoutNode;
}

export const STRUCTURE_VIEWER = 'https://dashpay.github.io/grovedb-structure-viewer/';

/** The structure viewer page of the general description of this kind of layer. */
export function structureViewerUrl(node: LayoutNode): string {
  return `${STRUCTURE_VIEWER}#/${node.structureNode}`;
}

function duration(seconds: number | undefined): string {
  if (seconds === undefined) return '?';
  for (const [size, unit] of [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ] as const) {
    if (seconds >= size && seconds % size === 0) return `${seconds / size}${unit}`;
  }
  return `${seconds}s`;
}

/** How a key reads in the tree: a fixed key's label, or what the keys at this position are. */
export function keyText(key: LayoutKey): string {
  switch (key.kind) {
    case 'fixed':
      return key.hex === '00' ? `[0] ${key.label ?? ''}`.trim() : (key.label ?? `0x${key.hex}`);
    case 'documentId':
      return '‹document id›';
    case 'revisionTime':
      return '‹revision time›';
    case 'propertyValue':
      return `‹${key.property} value›`;
    case 'timeRangeBucket':
      return `‹${key.property} window: ${duration(key.rangeSeconds)} every ${duration(key.stepSeconds)}›`;
    case 'integerRangeBucket':
      return `‹${key.property} band: ${compactNumber(key.range)} every ${compactNumber(key.step)}›`;
    case 'memberKey':
      return `‹${(key.components ?? []).join(' + ')}›`;
    default:
      return String((key as { kind: string }).kind);
  }
}

/** What a key stands for, in a sentence (for the tooltip). */
export function keyDetail(key: LayoutKey): string {
  switch (key.kind) {
    case 'fixed':
      return `The fixed key 0x${key.hex}.`;
    case 'documentId':
      return 'One key per document: its 32 byte id.';
    case 'revisionTime':
      return 'One key per stored revision: its block time in milliseconds (u64, big endian, sign bit flipped).';
    case 'propertyValue':
      return `One key per distinct value of ${key.property}, serialized for ordering; an absent or null value is the empty key.`;
    case 'timeRangeBucket':
      return `One key per window start of ${key.property}: windows of ${duration(key.rangeSeconds)} starting every ${duration(key.stepSeconds)}${key.phaseSeconds ? `, shifted by ${duration(key.phaseSeconds)}` : ''}.`;
    case 'integerRangeBucket':
      return `One key per window start of ${key.property} that holds a document: windows ${key.range?.toLocaleString('en-US')} wide starting every ${key.step?.toLocaleString('en-US')}${key.phase ? `, shifted by ${key.phase.toLocaleString('en-US')}` : ''}, encoded like the property.`;
    case 'memberKey':
      return `One key per entry: the values of ${(key.components ?? []).join(', ')} concatenated (32 bytes for $ownerId).`;
    default:
      return '';
  }
}

export type KindFamily = 'plain' | 'count' | 'sum' | 'countSum' | 'indexed' | 'value';

/** The family of an element kind, for its colour. */
export function kindFamily(element: string): KindFamily {
  if (element.endsWith('IndexedTree')) return 'indexed';
  if (!element.endsWith('Tree')) return 'value';
  const counts = element.includes('Count');
  const sums = element.includes('Sum');
  if (counts && sums) return 'countSum';
  if (counts) return 'count';
  if (sums) return 'sum';
  return 'plain';
}

/** What an element kind does, in a sentence. */
export function kindDetail(element: string): string {
  const provable = element.startsWith('Provable')
    ? ' Provable: the total is part of each node hash, so proofs can carry it (and ranges of it).'
    : '';
  switch (kindFamily(element)) {
    case 'plain':
      return 'A plain tree: no totals.';
    case 'count':
      return `Keeps a count of its entries.${provable}`;
    case 'sum':
      return `Keeps a sum of its entries' values.${provable}`;
    case 'countSum':
      return `Keeps a count and a sum of its entries.${provable}`;
    case 'indexed':
      return 'A ranked tree: keeps its entries ordered by their totals, for "top K" queries.';
    default:
      if (element === 'Item') return 'A value (the document, or an indexOnly entry).';
      if (element === 'ItemWithSumItem') return 'A value that also carries its sum to the tree above.';
      if (element === 'Reference') return 'A reference to the document in the primary key tree.';
      if (element === 'ReferenceWithSumItem') return 'A reference that also carries its sum to the tree above.';
      return element;
  }
}

export const WRAPPER_DETAIL: Record<string, string> = {
  NonCounted: 'Wrapped in NonCounted: the value tree above does not count this subtree.',
  NotSummed: 'Wrapped in NotSummed: the value tree above does not sum this subtree.',
  NotCountedOrSummed: 'Wrapped in NotCountedOrSummed: the value tree above neither counts nor sums this subtree.',
};

/** Every node in the layout, depth first (alternatives included). */
export function walk(node: LayoutNode, visit: (node: LayoutNode, depth: number) => void, depth = 0): void {
  visit(node, depth);
  if (node.alternative) walk(node.alternative.node, visit, depth + 1);
  for (const child of node.children) walk(child, visit, depth + 1);
}

/** Counts for the panel's summary line. */
export function layoutSummary(layout: DocumentTypeLayout): { layers: number; aggregates: number; ranked: number; wrapped: number } {
  let layers = 0;
  let aggregates = 0;
  let ranked = 0;
  let wrapped = 0;
  walk(layout.root, (node) => {
    layers++;
    const family = kindFamily(node.element);
    if (family === 'count' || family === 'sum' || family === 'countSum') aggregates++;
    if (family === 'indexed') ranked++;
    if (node.wrapper) wrapped++;
  });
  return { layers, aggregates, ranked, wrapped };
}
