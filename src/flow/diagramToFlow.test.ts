import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, edgeLabel, toEdges, toNodes, type EntityNodeData, type ExternalNodeData } from './diagramToFlow';
import { modelFromPastedJson } from '../model/introspect';
import { withRelationships } from '../model/relationships';
import charters from '../examples/moderation-charters.json';
import marketplace from '../examples/marketplace.json';
import type { Relationship } from '../model/types';

const model = withRelationships(modelFromPastedJson(charters));

describe('toEdges / toNodes', () => {
  const edges = toEdges(model, 'uml', new Set(), DEFAULT_FILTERS);
  const nodes = toNodes(model, 'uml', edges);

  it('starts every edge at a handle its source node renders', () => {
    for (const e of edges) {
      const node = nodes.find((n) => n.id === e.source)!;
      const data = node.data as EntityNodeData;
      expect(data.sources).toContain(e.sourceHandle!.slice('out:'.length));
    }
  });

  it('ends a list element edge on the list field', () => {
    const e = edges.find((x) => x.id.startsWith('ref:removedModerator.memberId'))!;
    expect(e.targetHandle).toBe('in:members');
    expect((nodes.find((n) => n.id === 'electedCharter')!.data as EntityNodeData).targets).toContain('members');
  });

  it('adds platform nodes only when a visible edge reaches them', () => {
    expect(nodes.filter((n) => n.type === 'external').map((n) => n.id).sort()).toEqual([
      'platform:contract',
      'platform:identityPublicKey',
    ]);
    const key = nodes.find((n) => n.id === 'platform:identityPublicKey')!.data as ExternalNodeData;
    expect(key.incoming).toBe(4);

    const noPlatform = toEdges(model, 'uml', new Set(), { ...DEFAULT_FILTERS, platform: false });
    expect(toNodes(model, 'uml', noPlatform).some((n) => n.type === 'external')).toBe(false);
  });

  it('drops hidden edges and filtered kinds', () => {
    const first = edges[0].id;
    expect(toEdges(model, 'uml', new Set([first]), DEFAULT_FILTERS).some((e) => e.id === first)).toBe(false);
    expect(toEdges(model, 'uml', new Set(), { ...DEFAULT_FILTERS, inferred: false }).every((e) => !e.id.startsWith('inf:'))).toBe(true);
  });
});

describe('edgeLabel', () => {
  const m = withRelationships(modelFromPastedJson(marketplace));
  const rel = (from: string, field: string, to?: string) =>
    m.relationships.find((r) => r.from === from && r.fromField === field && (!to || r.to === to)) as Relationship;

  it('shows multiplicity and how the target is found', () => {
    expect(edgeLabel(rel('listing', 'shopId'), 'uml')).toBe('1');
    expect(edgeLabel(rel('shop', 'dpnsDomainId'), 'uml')).toBe('0..1 · deletable');
    expect(edgeLabel(rel('giftCard', '$creatorId'), 'uml')).toBe('«creator» · via byOwner');
    expect(edgeLabel(rel('offer', 'sellerId'), 'uml')).toBe('1 · decryption key');
    expect(edgeLabel(rel('review', 'subjectId', 'platform:identity'), 'uml')).toBe('1 · anyOf 2/2');
  });

  it('uses Merise cardinalities in the Merise view', () => {
    expect(edgeLabel(rel('listing', 'shopId'), 'merise')).toBe('(1,1)');
    expect(edgeLabel(rel('shop', 'dpnsDomainId'), 'merise')).toBe('(0,1) · deletable');
  });
});
