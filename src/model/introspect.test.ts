import { describe, expect, it } from 'vitest';
import { isIdentifierProp, metaFromContractJson, modelFromPastedJson } from './introspect';
import dashQa from '../examples/dash-qa.json';
import marketplace from '../examples/marketplace.json';
import charters from '../examples/moderation-charters.json';
import yappr from '../examples/yappr-likes.json';

const entity = (m: ReturnType<typeof modelFromPastedJson>, name: string) => m.entities.find((e) => e.name === name)!;
const field = (m: ReturnType<typeof modelFromPastedJson>, type: string, path: string) =>
  entity(m, type).fields.find((f) => f.path === path)!;

describe('modelFromPastedJson — dash-qa (no protocol 14 keywords)', () => {
  const model = modelFromPastedJson(dashQa);

  it('builds one entity per document type with metadata', () => {
    expect(model.entities.map((e) => e.name).sort()).toEqual(['testCase', 'testRun']);
    expect(model.contractId).toBe('2gevmsNEaWnWQURQpuWeN5QnLfC2ufrZG4SXkVMqeUgZ');
    expect(model.version).toBe(1);
  });

  it('orders fields by position and flags required/unique/indexed', () => {
    const testCase = entity(model, 'testCase');
    expect(testCase.fields[0].name).toBe('testId');
    const testId = field(model, 'testCase', 'testId');
    expect(testId.required).toBe(true);
    expect(testId.unique).toBe(true);
    expect(testId.indexed).toBe(true);
    const planCommit = field(model, 'testCase', 'planCommit');
    expect(planCommit.required).toBe(false);
    expect(planCommit.indexed).toBe(false);
  });

  it('surfaces a system $createdAt field referenced only by required + index', () => {
    const created = field(model, 'testRun', '$createdAt');
    expect(created.system).toBe(true);
    expect(created.type).toBe('timestamp');
    expect(created.indexed).toBe(true);
    expect(created.required).toBe(true);
  });

  it('parses indices with fields and unique flag', () => {
    const composite = entity(model, 'testRun').indices.find((i) => i.name === 'ownerTestCreated')!;
    expect(composite.fields.map((f) => f.field)).toEqual(['$ownerId', 'testId', '$createdAt']);
    expect(entity(model, 'testCase').indices.find((i) => i.name === 'testId')!.unique).toBe(true);
  });

  it('keeps document type settings in config', () => {
    expect(entity(model, 'testRun').config).toMatchObject({ documentsMutable: false, canBeDeleted: false, creationRestrictionMode: 1 });
  });
});

describe('modelFromPastedJson — protocol 14 property keywords', () => {
  const m = modelFromPastedJson(marketplace);
  const mc = modelFromPastedJson(charters);

  it('flattens nested objects into indented dotted paths', () => {
    const leader = field(mc, 'submittedCharter', 'rewardSplit.leader');
    expect(leader.name).toBe('leader');
    expect(leader.depth).toBe(1);
    expect(leader.required).toBe(true);
    const types = entity(mc, 'submittedCharter').fields.map((f) => f.path);
    expect(types.indexOf('rewardSplit')).toBe(types.indexOf('rewardSplit.leader') - 1);
  });

  it('shows typed arrays by element type and keeps element constraints', () => {
    expect(field(mc, 'submittedCharter', 'reasons').type).toBe('identifier[]');
    const tags = field(m, 'listing', 'tags');
    expect(tags.type).toBe('string[]');
    expect(tags.items).toMatchObject({ minLength: 1, maxLength: 24 });
    expect(tags.constraints).toMatchObject({ maxItems: 8, uniqueItems: true });
  });

  it('resolves $ref through schemaDefs', () => {
    const price = field(m, 'listing', 'price');
    expect(price.ref).toBe('credits');
    expect(price.type).toBe('integer');
    expect(price.constraints).toMatchObject({ minimum: 1, maximum: 1000000000000 });
  });

  it('marks immutable, set-once, transient, requiredSince, encryptedFor, distinctFrom and maxBytes', () => {
    expect(field(m, 'listing', 'shopId').immutable).toBe(true);
    expect(field(m, 'listing', 'sku')).toMatchObject({ immutable: true, allowSettingOnce: true });
    expect(field(m, 'offer', 'acceptTerms').transient).toBe(true);
    expect(field(m, 'listing', 'photoHash').requiredSince).toBe(2);
    expect(field(m, 'offer', 'note').encryptedFor).toEqual({
      recipient: 'sellerId',
      recipientKey: 'sellerKeyId',
      senderKey: 'buyerKeyId',
      scheme: 'ecdh-secp256k1-aes256-cbc',
    });
    expect(field(m, 'offer', 'sellerId').distinctFrom).toBe('$ownerId');
    expect(field(mc, 'electedCharter', 'members').distinctFrom).toBe('$ownerId'); // on the elements
    expect(field(m, 'shop', 'bio').constraints.maxBytes).toBe(2000);
  });

  it('attaches references to properties, typed array elements and the document type', () => {
    expect(field(m, 'listing', 'shopId').reference).toMatchObject({ path: 'shopId', site: 'property' });
    expect(field(mc, 'electedCharter', 'members').reference).toMatchObject({ path: 'members[]', site: 'element' });
    const gift = entity(m, 'giftCard');
    expect(gift.typeReferences.map((r) => [r.path, r.site])).toEqual([['$creatorId', 'creator']]);
    // the creator row exists so the edge has somewhere to start
    expect(field(m, 'giftCard', '$creatorId')).toMatchObject({ system: true, type: 'identifier' });
    expect(field(mc, 'resignationRequest', '$ownerId').reference?.site).toBe('owner');
  });

  it('keeps every document type keyword and index keyword', () => {
    const listing = entity(m, 'listing');
    expect(listing.config).toMatchObject({ ttl: 2592000, canBeDeletedByModeratorsFor: 604800, documentsCountable: true });
    expect(listing.config.actionFees).toEqual({ create: { owner: 100000, moderators: 50000 } });
    expect(listing.propertyConstraints).toHaveProperty('saleBelowPrice');
    expect(listing.indices.find((i) => i.name === 'newListings')!.options.timeRange).toEqual({
      on: '$createdAt',
      range: 86400,
      step: 3600,
    });
    const likes = modelFromPastedJson(yappr);
    const byHashtagPost = entity(likes, 'like').indices.find((i) => i.name === 'byHashtagPost')!;
    expect(byHashtagPost.options).toMatchObject({ terminal: '$ownerId', rankedCountable: true, skipIfAbsent: true });
    expect(entity(likes, 'like').config.indexOnly).toBe(true);
    // a terminal names a system field, which is surfaced
    expect(field(likes, 'like', '$ownerId').system).toBe(true);
  });
});

describe('metaFromContractJson', () => {
  it('reads keywords, description, schemaDefs and moderation config', () => {
    const meta = metaFromContractJson(marketplace as Record<string, unknown>);
    expect(meta.keywords).toEqual(['marketplace', 'shop', 'showcase']);
    expect(meta.description).toMatch(/marketplace/i);
    expect(Object.keys(meta.schemaDefs ?? {})).toEqual(['credits']);
    expect((meta.config?.moderation as Record<string, unknown>).banlist).toBe(true);
  });

  it('drops empty groups and tokens and reads timestamps', () => {
    const meta = metaFromContractJson({ id: 'x', groups: {}, tokens: {}, createdAt: 1790260543000, documentSchemas: {} });
    expect(meta.groups).toBeUndefined();
    expect(meta.tokens).toBeUndefined();
    expect(meta.times).toEqual({ createdAt: 1790260543000 });
  });
});

describe('isIdentifierProp', () => {
  it('detects identifier byte arrays', () => {
    expect(
      isIdentifierProp({ type: 'array', byteArray: true, contentMediaType: 'application/x.dash.dpp.identifier' }),
    ).toBe(true);
    expect(isIdentifierProp({ type: 'string' })).toBe(false);
    expect(isIdentifierProp(undefined)).toBe(false);
  });
});

describe('modelFromPastedJson — input shapes', () => {
  it('accepts a documentSchemas wrapper', () => {
    const m = modelFromPastedJson({ id: 'x', documentSchemas: dashQa.documentSchemas });
    expect(m.entities.length).toBe(2);
    expect(m.contractId).toBe('x');
  });

  it('accepts a bare schemas map', () => {
    expect(modelFromPastedJson(dashQa.documentSchemas).entities.length).toBe(2);
  });

  it('throws on unrecognised input', () => {
    expect(() => modelFromPastedJson({ foo: 1 })).toThrow();
    expect(() => modelFromPastedJson(42)).toThrow();
  });
});
