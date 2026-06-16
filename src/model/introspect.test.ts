import { describe, expect, it } from 'vitest';
import { isIdentifierProp, modelFromPastedJson, toContractModel } from './introspect';
import { DEMO_SCHEMAS } from './demo';

describe('toContractModel', () => {
  const model = toContractModel(DEMO_SCHEMAS, { contractId: 'c', ownerId: 'o', version: 1 });

  it('builds one entity per document type with metadata', () => {
    expect(model.entities.map((e) => e.name).sort()).toEqual(['testCase', 'testRun']);
    expect(model.contractId).toBe('c');
    expect(model.version).toBe(1);
  });

  it('orders fields by position and flags required/unique/indexed', () => {
    const testCase = model.entities.find((e) => e.name === 'testCase')!;
    expect(testCase.fields[0].name).toBe('testId');
    const testId = testCase.fields.find((f) => f.name === 'testId')!;
    expect(testId.required).toBe(true);
    expect(testId.unique).toBe(true);
    expect(testId.indexed).toBe(true);
    const planCommit = testCase.fields.find((f) => f.name === 'planCommit')!;
    expect(planCommit.required).toBe(false);
    expect(planCommit.indexed).toBe(false);
  });

  it('surfaces a system $createdAt field referenced only by required + index', () => {
    const testRun = model.entities.find((e) => e.name === 'testRun')!;
    const created = testRun.fields.find((f) => f.name === '$createdAt')!;
    expect(created).toBeDefined();
    expect(created.system).toBe(true);
    expect(created.type).toBe('timestamp');
    expect(created.indexed).toBe(true);
    expect(created.required).toBe(true);
  });

  it('parses indices with fields and unique flag', () => {
    const testRun = model.entities.find((e) => e.name === 'testRun')!;
    const composite = testRun.indices.find((i) => i.name === 'ownerTestCreated')!;
    expect(composite.fields.map((f) => f.field)).toEqual(['$ownerId', 'testId', '$createdAt']);
    const uniqueIdx = model.entities
      .find((e) => e.name === 'testCase')!
      .indices.find((i) => i.name === 'testId')!;
    expect(uniqueIdx.unique).toBe(true);
  });

  it('captures constraints for the inspector', () => {
    const testCase = model.entities.find((e) => e.name === 'testCase')!;
    const title = testCase.fields.find((f) => f.name === 'title')!;
    expect(title.constraints.maxLength).toBe(255);
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

describe('modelFromPastedJson', () => {
  it('accepts a documentSchemas wrapper', () => {
    const m = modelFromPastedJson({ id: 'x', documentSchemas: DEMO_SCHEMAS });
    expect(m.entities.length).toBe(2);
    expect(m.contractId).toBe('x');
  });

  it('accepts a bare schemas map', () => {
    expect(modelFromPastedJson(DEMO_SCHEMAS).entities.length).toBe(2);
  });

  it('throws on unrecognised input', () => {
    expect(() => modelFromPastedJson({ foo: 1 })).toThrow();
    expect(() => modelFromPastedJson(42)).toThrow();
  });
});
