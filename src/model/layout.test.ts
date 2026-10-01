import { describe, expect, it } from 'vitest';
import { keyText, kindFamily, layoutSummary, structureViewerUrl, walk, type DocumentTypeLayout, type LayoutNode } from './layout';
import { contractJsonForSdk } from '../sdk/layout';
import fixtures from './fixtures/document-type-layouts.json';

// Layouts computed by `documentTypeLayout` (dashpay/platform#5153) for three
// bundled examples.
const layouts = fixtures as unknown as Record<string, DocumentTypeLayout>;
const listing = layouts['marketplace:listing'];
const tip = layouts['yappr-likes:tip'];
const domain = layouts['dpns:domain'];

function find(root: LayoutNode, test: (n: LayoutNode) => boolean): LayoutNode {
  let found: LayoutNode | undefined;
  walk(root, (n) => {
    if (!found && test(n)) found = n;
  });
  if (!found) throw new Error('no such node');
  return found;
}

describe('keyText', () => {
  it('reads fixed keys by label and [0] keys with their index', () => {
    expect(keyText(listing.root.key)).toBe('listing');
    expect(keyText(listing.root.children[0].key)).toBe('[0] PrimaryKey');
  });

  it('reads families of keys in angle quotes', () => {
    expect(keyText({ kind: 'documentId' })).toBe('‹document id›');
    expect(keyText({ kind: 'propertyValue', property: 'shopId' })).toBe('‹shopId value›');
    expect(keyText({ kind: 'integerRangeBucket', property: 'price', range: 300, step: 100, phase: 0 })).toBe('‹price band: 300 every 100›');
    const window = find(listing.root, (n) => n.key.kind === 'timeRangeBucket');
    expect(keyText(window.key)).toBe('‹$createdAt window: 1d every 1h›');
    const members: string[] = [];
    walk(tip.root, (n) => {
      if (n.key.kind === 'memberKey') members.push(keyText(n.key));
    });
    expect(members).toEqual(['‹postId›', '‹$ownerId›']);
  });
});

describe('kindFamily', () => {
  it('colours trees by what they total', () => {
    expect(kindFamily('Tree')).toBe('plain');
    expect(kindFamily('CountTree')).toBe('count');
    expect(kindFamily('ProvableSumTree')).toBe('sum');
    expect(kindFamily('ProvableCountProvableSumTree')).toBe('countSum');
    expect(kindFamily('ProvableCountProvableSumIndexedTree')).toBe('indexed');
    expect(kindFamily('Reference')).toBe('value');
    expect(kindFamily('ItemWithSumItem')).toBe('value');
  });
});

describe('the fixtures', () => {
  it('summarise what each layout counts, sums and ranks', () => {
    expect(layoutSummary(listing)).toEqual({ layers: 25, aggregates: 7, ranked: 0, wrapped: 0 });
    expect(layoutSummary(tip).ranked).toBe(1);
  });

  it('keep a unique index fallback reachable by walk', () => {
    const unique = find(domain.root, (n) => n.alternative !== undefined);
    expect(unique.element).toBe('Reference');
    expect(unique.alternative?.node.children[0].key.kind).toBe('documentId');
  });

  it('link each layer to the structure viewer node it is an instance of', () => {
    expect(structureViewerUrl(listing.root)).toBe(
      'https://dashpay.github.io/grovedb-structure-viewer/#/contracts.contract.documents.document_type',
    );
  });

  it('carry the skip note only on optional properties of indexOnly types', () => {
    walk(tip.root, (n) => {
      expect(n.notes.map((note) => note.code)).not.toContain('skipIfAbsent');
    });
  });
});

describe('contractJsonForSdk', () => {
  it('wraps a bare map of document schemas and fills in what the SDK needs', () => {
    const json = contractJsonForSdk({ note: { type: 'object', properties: {} } });
    expect(json.documentSchemas).toEqual({ note: { type: 'object', properties: {} } });
    expect(json).toMatchObject({ $formatVersion: '1', version: 1 });
    expect(typeof json.id).toBe('string');
    expect(typeof json.ownerId).toBe('string');
  });

  it('keeps a contract as it is', () => {
    const contract = { $formatVersion: '1', id: 'x', ownerId: 'y', version: 3, documentSchemas: { a: {} } };
    expect(contractJsonForSdk(contract)).toEqual(contract);
  });
});
