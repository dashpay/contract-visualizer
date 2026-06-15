import { describe, expect, it } from 'vitest';
import { inferRelationships } from './relationships';
import { toContractModel } from './introspect';
import { DEMO_SCHEMAS } from './demo';

describe('inferRelationships — dash-qa', () => {
  const rels = inferRelationships(toContractModel(DEMO_SCHEMAS));

  it('infers exactly the testRun -> testCase edge on testId', () => {
    expect(rels.length).toBe(1);
    const r = rels[0];
    expect(r.from).toBe('testRun');
    expect(r.to).toBe('testCase');
    expect(r.fromField).toBe('testId');
    expect(r.toField).toBe('testId');
    expect(r.confidence).toBe('high');
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
});
