import { describe, expect, it } from 'vitest';
import { inferRelationships, withRelationships } from './relationships';
import { modelFromPastedJson, toContractModel } from './introspect';
import { EXAMPLES } from '../examples';
import sdkReferences from './fixtures/sdk-references.json';
import dashQa from '../examples/dash-qa.json';
import marketplace from '../examples/marketplace.json';
import charters from '../examples/moderation-charters.json';

const build = (c: unknown) => withRelationships(modelFromPastedJson(c));

describe('declared references agree with the platform parser', () => {
  // sdk-references.json is DataContract.documentReferences from
  // @dashevo/evo-sdk 5.0.0-beta.1 (full validation, protocol version 14) for
  // each bundled example: [{ path, type }] per document type.
  const expected = sdkReferences as Record<string, Record<string, Array<{ path: string; type: string }>>>;

  for (const ex of EXAMPLES) {
    it(`finds the same references as the SDK in ${ex.key}`, () => {
      const model = modelFromPastedJson(ex.contract);
      const ours: Record<string, Array<{ path: string; type: string }>> = {};
      for (const e of model.entities) {
        const refs = [...e.typeReferences, ...e.fields.filter((f) => f.reference && !f.system).map((f) => f.reference!)];
        if (!refs.length) continue;
        ours[e.name] = refs.map((r) => ({ path: r.path, type: r.expr.op === 'target' ? r.expr.target.type : r.expr.op }));
      }
      expect(ours).toEqual(expected[ex.key]);
    });
  }
});

describe('declared relationships — moderation charters', () => {
  const model = build(charters);
  const declared = model.relationships.filter((r) => r.kind === 'declared');
  const find = (from: string, field: string) => declared.filter((r) => r.from === from && r.fromField === field);

  it('draws an anyOf ownerRefersTo as one edge per operand', () => {
    const edges = find('resignationRequest', '$ownerId');
    expect(edges.map((e) => [e.to, e.target?.type, e.expression?.branch, e.expression?.of])).toEqual([
      ['electedCharter', 'permanentDocument', 1, 2],
      ['addedModerator', 'deletableDocument', 2, 2],
    ]);
    expect(edges.every((e) => e.site === 'owner')).toBe(true);
  });

  it('points an inList at the list and a findBy at the unique index it resolves to', () => {
    const [member] = find('removedModerator', 'memberId');
    expect(member).toMatchObject({ to: 'electedCharter', toField: 'members', optional: false });
    expect(member.target).toMatchObject({ type: 'permanentDocument', findBy: { $id: 'electedCharterId' }, inList: 'members' });
    const [elem] = find('electedCharter', 'members');
    expect(elem).toMatchObject({ to: 'joinRequest', toField: 'bySubmittedCharter', site: 'element' });
  });

  it('sends platform targets to shared platform nodes', () => {
    expect(find('submittedCharter', 'targetContractId')[0].to).toBe('platform:contract');
    expect(find('joinRequest', 'recipientId')[0].to).toBe('platform:identityPublicKey');
    expect(find('joinRequest', 'senderKeyId')[0].to).toBe('platform:identityPublicKey');
    expect(model.externals.map((n) => n.id).sort()).toEqual(['platform:contract', 'platform:identityPublicKey']);
  });

  it('infers only what is not declared, and never from system fields', () => {
    const inferred = model.relationships.filter((r) => r.kind === 'inferred');
    // addedModerator.submittedCharterId declares no refersTo; its name still points at submittedCharter
    expect(inferred.map((r) => `${r.from}.${r.fromField}->${r.to}`)).toContain('addedModerator.submittedCharterId->submittedCharter');
    expect(inferred.some((r) => r.fromField.startsWith('$'))).toBe(false);
    for (const r of inferred) {
      expect(declared.some((d) => d.from === r.from && d.fromField === r.fromField)).toBe(false);
    }
  });
});

describe('declared relationships — marketplace', () => {
  const model = build(marketplace);
  const byField = (from: string, field: string) =>
    model.relationships.filter((r) => r.kind === 'declared' && r.from === from && r.fromField === field);

  it('gives another contract its own node', () => {
    const [dpns] = byField('shop', 'dpnsDomainId');
    expect(dpns.to).toBe('external:GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec/domain');
    expect(dpns.optional).toBe(true);
    const node = model.externals.find((n) => n.id === dpns.to)!;
    expect(node).toMatchObject({ kind: 'externalDocument', documentType: 'domain' });
  });

  it('marks optional references and creator references', () => {
    expect(byField('listing', 'shopId')[0]).toMatchObject({ to: 'shop', optional: false, site: 'property' });
    expect(byField('giftCard', '$creatorId')[0]).toMatchObject({ to: 'shop', site: 'creator', toField: 'byOwner' });
  });

  it('splits a property anyOf between a document type and a platform node', () => {
    expect(byField('review', 'subjectId').map((r) => r.to)).toEqual(['shop', 'platform:identity']);
  });
});

describe('inferRelationships — dash-qa', () => {
  const rels = inferRelationships(modelFromPastedJson(dashQa));

  it('infers exactly the testRun -> testCase edge on testId', () => {
    expect(rels.length).toBe(1);
    const r = rels[0];
    expect(r).toMatchObject({ from: 'testRun', to: 'testCase', fromField: 'testId', toField: 'testId', confidence: 'high', kind: 'inferred' });
  });

  it('never produces self-edges', () => {
    expect(rels.every((r) => r.from !== r.to)).toBe(true);
  });
});

describe('inferRelationships — identifier-named field heuristic', () => {
  const schemas = {
    author: {
      type: 'object',
      properties: { name: { type: 'string', position: 0 } },
      indices: [{ name: 'pk', properties: [{ name: 'asc' }], unique: true }],
      required: ['name'],
    },
    post: {
      type: 'object',
      properties: {
        authorId: {
          type: 'array',
          byteArray: true,
          contentMediaType: 'application/x.dash.dpp.identifier',
          position: 0,
        },
        title: { type: 'string', position: 1 },
      },
      indices: [],
      required: ['authorId'],
    },
  };
  const rels = inferRelationships(toContractModel(schemas));

  it('links post.authorId -> author with high confidence', () => {
    const r = rels.find((x) => x.from === 'post' && x.to === 'author');
    expect(r).toBeDefined();
    expect(r!.fromField).toBe('authorId');
    expect(r!.confidence).toBe('high');
  });

  it('does not invent a reverse edge', () => {
    expect(rels.some((r) => r.from === 'author' && r.to === 'post')).toBe(false);
  });

  it('stays quiet once the field declares refersTo', () => {
    const declared = structuredClone(schemas) as typeof schemas & { post: { properties: { authorId: Record<string, unknown> } } };
    declared.post.properties.authorId.refersTo = { type: 'permanentDocument', documentType: 'author' };
    const model = withRelationships(toContractModel(declared));
    expect(model.relationships.map((r) => r.kind)).toEqual(['declared']);
  });
});

describe('inferRelationships — no false edges between unrelated types', () => {
  const schemas = {
    alpha: {
      type: 'object',
      properties: { a: { type: 'string', position: 0 } },
      indices: [{ name: 'pk', properties: [{ a: 'asc' }], unique: true }],
      required: ['a'],
    },
    beta: {
      type: 'object',
      properties: { b: { type: 'string', position: 0 } },
      indices: [{ name: 'pk', properties: [{ b: 'asc' }], unique: true }],
      required: ['b'],
    },
  };
  it('produces no relationships when nothing matches', () => {
    expect(inferRelationships(toContractModel(schemas)).length).toBe(0);
  });

  it('does not link types just because both index $ownerId', () => {
    const owned = {
      a: { type: 'object', properties: { x: { type: 'string', position: 0 } }, indices: [{ name: 'o', properties: [{ $ownerId: 'asc' }] }] },
      b: { type: 'object', properties: { y: { type: 'string', position: 0 } }, indices: [{ name: 'o', properties: [{ $ownerId: 'asc' }] }] },
    };
    expect(inferRelationships(toContractModel(owned))).toEqual([]);
  });
});
