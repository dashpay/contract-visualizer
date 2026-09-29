import { describe, expect, it } from 'vitest';
import {
  adjustableFields,
  bytesToCredits,
  creditsToDash,
  formatCredits,
  formatDash,
  formatUsd,
  indexAlone,
  type DocumentCreateCost,
} from './cost';
import fixtures from './fixtures/document-create-costs.json';

// Costs computed by `documentCreateCost` (Drive) for bundled examples.
const costs = fixtures as unknown as Record<string, DocumentCreateCost>;
const listing = costs['marketplace:listing'];
const domain = costs['dpns:domain'];
const tip = costs['yappr-likes:tip'];

describe('formatting', () => {
  it('shows Dash to three significant digits', () => {
    expect(formatDash(0.00189234)).toBe('0.00189 DASH');
    expect(formatDash(0.1)).toBe('0.1 DASH');
    expect(formatDash(12.3456)).toBe('12.3 DASH');
  });

  it('shows dollars in cents, and small amounts to two significant digits', () => {
    expect(formatUsd(0.1234)).toBe('$0.12');
    expect(formatUsd(3.5)).toBe('$3.50');
    expect(formatUsd(0.00123)).toBe('$0.0012');
    expect(formatUsd(0)).toBe('$0');
  });

  it('converts credits at 100 billion a Dash', () => {
    expect(creditsToDash(domain, 100_000_000_000)).toBe(1);
    expect(formatCredits(domain, 10_000_000_000, 64.5)).toBe('0.1 DASH ($6.45)');
    expect(formatCredits(domain, 10_000_000_000, null)).toBe('0.1 DASH');
  });
});

describe('the fixtures', () => {
  it('price storage at the rate they give', () => {
    expect(domain.creditsPerByte).toBe(27_000);
    expect(domain.storage.credits.newValues).toBe(bytesToCredits(domain, domain.storage.bytes.newValues));
  });

  it('price a document with a ttl by its lifetime, without a refund', () => {
    expect(listing.creditsPerByte).toBeLessThan(27_000);
    expect(listing.refund.sameEpoch?.newValues).toBe(0);
    expect(listing.processing.map((p) => p.code)).toContain('ttlCleanup');
  });

  it('show a contested name with its contest fund', () => {
    expect(domain.contractCharges).toContainEqual(
      expect.objectContaining({ kind: 'contestFund', credits: 10_000_000_000 }),
    );
  });

  it('cost an index on its own as its shared and own bytes', () => {
    for (const index of listing.indexes) {
      expect(indexAlone(index).newValues).toBe(index.sharedBytes.newValues + index.ownBytes.newValues);
    }
    // Every byte is primary storage, an index's (a shared layer once), a
    // preallocation or an expiration entry.
    const shared = new Map<string, number>();
    for (const element of listing.elements) {
      if (element.indexes.length > 1 && !element.ephemeral) shared.set(element.path.join('/'), element.bytes);
    }
    const own = listing.indexes.reduce((sum, index) => sum + index.ownBytes.newValues, 0);
    const sharedOnce = [...shared.values()].reduce((sum, bytes) => sum + bytes, 0);
    expect(
      listing.storage.primaryBytes.newValues +
        own +
        sharedOnce +
        listing.storage.preallocatedBytes.newValues +
        listing.storage.expirationBytes.newValues,
    ).toBe(listing.storage.bytes.newValues);
  });

  it('offer controls for optional and variable-size fields only', () => {
    const fields = adjustableFields(tip);
    expect(fields.every((field) => field.optional || field.length !== undefined)).toBe(true);
    expect(tip.fields.some((field) => field.kind === 'identifier' && !field.optional)).toBe(true);
    expect(fields.some((field) => field.kind === 'identifier' && !field.optional)).toBe(false);
  });
});
