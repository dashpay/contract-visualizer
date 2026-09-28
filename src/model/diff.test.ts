import { describe, expect, it } from 'vitest';
import { diffContracts, type Change } from './diff';
import marketplace from '../examples/marketplace.json';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const clone = (): Json => structuredClone(marketplace) as Json;
const types = (c: Json) => c.documentSchemas as Json;
const find = (changes: Change[], id: string) => changes.find((c) => c.id === id);
const codes = (c: Change | undefined) => (c?.refusals ?? []).filter((r) => r.severity === 'refused').map((r) => r.code);

describe('diffContracts — no change', () => {
  it('finds nothing between a contract and itself', () => {
    const d = diffContracts(marketplace, clone());
    expect(d.changes).toEqual([]);
    expect(d.summary).toMatchObject({ changes: 0, refused: 0, typesAdded: 0, typesRemoved: 0, typesChanged: 0 });
  });

  it('treats a stated config default like a left-out one', () => {
    const head = clone();
    head.config = { ...head.config, readonly: false, keepsHistory: false, requiresIdentityEncryptionBoundedKey: null };
    const base = clone();
    delete base.config.sizedIntegerTypes; // format 2 sizes integers by default
    expect(diffContracts(base, head).changes).toEqual([]);
  });

  it('ignores key order', () => {
    const head = clone();
    const listing = types(head).listing;
    types(head).listing = Object.fromEntries(Object.entries(listing).reverse());
    expect(diffContracts(marketplace, head).changes).toEqual([]);
  });
});

describe('diffContracts — changes the update rules allow', () => {
  const head = clone();
  head.version = 3;
  head.keywords = ['marketplace', 'shop'];
  const listing = types(head).listing;
  listing.properties.title.maxLength = 200; // raising maxLength is allowed
  listing.properties.title.maxBytes = 400; // so is raising maxBytes
  listing.properties.color = { type: 'string', maxLength: 16, position: 8 }; // optional: allowed
  listing.properties.condition = { type: 'string', maxLength: 8, position: 9, requiredSince: 3 };
  listing.required.push('condition'); // required with requiredSince == new version: allowed
  listing.properties.category.enum.push('toys'); // enum may gain values
  listing.description = 'An item for sale'; // free
  const d = diffContracts(marketplace, head);

  it('lists each change and refuses none', () => {
    expect(d.summary.refused).toBe(0);
    expect(find(d.changes, 'field:listing:title')?.keys.map((k) => k.key).sort()).toEqual(['maxBytes', 'maxLength']);
    expect(find(d.changes, 'field:listing:color')?.kind).toBe('added');
    expect(find(d.changes, 'field:listing:condition')).toMatchObject({ kind: 'added', refusals: [] });
    expect(find(d.changes, 'field:listing:category')?.keys[0]).toMatchObject({ key: 'enum' });
    expect(find(d.changes, 'contract')?.keys.map((k) => k.key)).toEqual(['version', 'keywords']);
  });

  it('marks what changed for the canvas and keeps untouched types unchanged', () => {
    expect(d.status.entities).toEqual({ listing: 'changed' });
    expect(d.status.fields['listing::color']).toBe('added');
    expect(d.status.fields['listing::title']).toBe('changed');
    expect(d.status.fields['shop::handle']).toBeUndefined();
  });
});

describe('diffContracts — changes the update rules refuse', () => {
  const head = clone();
  head.version = 4; // must be 3
  head.config.moderation.warnings = false; // the lists kept are fixed
  const t = types(head);
  t.listing.ttl = 86400; // fixed (40212)
  t.listing.properties.weight = { type: 'integer', minimum: 0, position: 8 };
  t.listing.required.push('weight'); // required without requiredSince (10276)
  t.listing.indices.push({ name: 'byTitle', properties: [{ title: 'asc' }] }); // index added (10217)
  t.listing.propertyConstraints.titleShort = { lessThan: [{ length: 'title' }, 100] }; // rule added (10246)
  t.shop.properties.bio.maxBytes = 1000; // lowered (10246)
  t.offer.properties.listingId.refersTo.type = 'permanentDocument'; // refersTo changed (10246)
  delete t.report.properties.details; // property removed (10246)
  delete t.giftCard; // document type removed (40212)
  t.wishlist = {
    type: 'object',
    properties: { note: { type: 'string', maxLength: 64, position: 0, requiredSince: 2 } }, // must be 4
    required: ['note'],
    additionalProperties: false,
  };
  const d = diffContracts(marketplace, head);

  it('refuses each with the error the book names', () => {
    expect(codes(find(d.changes, 'contract'))).toEqual([10212, 40002]);
    expect(codes(find(d.changes, 'type:listing'))).toEqual([40212]);
    expect(codes(find(d.changes, 'field:listing:weight'))).toEqual([10276]);
    expect(codes(find(d.changes, 'index:listing:byTitle'))).toEqual([10217]);
    expect(codes(find(d.changes, 'rule:listing:titleShort'))).toEqual([10246]);
    expect(codes(find(d.changes, 'field:shop:bio'))).toEqual([10246]);
    expect(codes(find(d.changes, 'field:offer:listingId'))).toEqual([10246]);
    expect(codes(find(d.changes, 'field:report:details'))).toEqual([10246]);
    expect(codes(find(d.changes, 'type:giftCard'))).toEqual([40212]);
    expect(codes(find(d.changes, 'type:wishlist'))).toEqual([10276]);
  });

  it('keeps removed parts in the merged model so the canvas can draw them struck out', () => {
    expect(d.status.entities).toMatchObject({ giftCard: 'removed', wishlist: 'added' });
    expect(d.merged.entities.map((e) => e.name)).toContain('giftCard');
    const report = d.merged.entities.find((e) => e.name === 'report')!;
    expect(report.fields.map((f) => f.path)).toContain('details');
    expect(d.status.fields['report::details']).toBe('removed');
    // giftCard's references are gone from head, so their edges are marked removed
    const removedEdges = Object.entries(d.status.relationships).filter(([, k]) => k === 'removed').map(([id]) => id);
    expect(removedEdges.some((id) => id.startsWith('ref:giftCard.'))).toBe(true);
    expect(d.status.refused.has('field:listing::weight')).toBe(true);
  });

  it('counts the findings', () => {
    expect(d.summary).toMatchObject({ refused: 11, typesAdded: 1, typesRemoved: 1 });
  });
});

describe('diffContracts — integer bounds are a check, not a verdict', () => {
  it('flags a raised integer maximum for review', () => {
    const head = clone();
    head.version = 3;
    types(head).review.properties.rating.maximum = 10;
    const c = find(diffContracts(marketplace, head).changes, 'field:review:rating')!;
    expect(c.refusals.map((r) => [r.severity, r.code])).toEqual([['check', 40212]]);
  });
});
