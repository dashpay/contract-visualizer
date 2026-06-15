// Bundled sample contract for ?demo=1 and tests: the live dash-qa contract's
// document schemas (testCase + testRun). Mirrors the registered schema, so the
// demo renders offline and exercises the testRun -> testCase inference.

import type { ContractMeta } from './introspect';

export const DEMO_META: ContractMeta = {
  contractId: '2qEVUbg4znNgNRs3FJQ4kof4NKpB8q4fGtYa7qBouLzw',
  ownerId: '85KjYZLZXA7YZBPyFEjiMaH36xcQpBBZisKGBHF3uKuH',
  version: 1,
};

export const DEMO_SCHEMAS: Record<string, Record<string, unknown>> = {
  testCase: {
    type: 'object',
    documentsMutable: true,
    canBeDeleted: true,
    creationRestrictionMode: 1,
    indices: [
      { name: 'testId', properties: [{ testId: 'asc' }], unique: true },
      { name: 'tier', properties: [{ tier: 'asc' }] },
      { name: 'category', properties: [{ category: 'asc' }] },
    ],
    properties: {
      testId: { type: 'string', minLength: 1, maxLength: 32, position: 0, description: 'Stable test identifier (e.g. CORE-05).' },
      title: { type: 'string', minLength: 1, maxLength: 255, position: 1, description: 'Human-readable action being tested.' },
      tier: { type: 'string', minLength: 1, maxLength: 16, position: 2, description: 'Frequency tier.' },
      category: { type: 'string', minLength: 1, maxLength: 32, position: 3, description: 'Feature area / Domain.' },
      layer: { type: 'string', minLength: 1, maxLength: 16, position: 4, description: 'Stack layer.' },
      implStatus: { type: 'string', minLength: 1, maxLength: 32, position: 5, description: 'Implementation status glyph.' },
      description: { type: 'string', maxLength: 2048, position: 6, description: "Entry point & test notes." },
      entryPoint: { type: 'string', maxLength: 512, position: 7, description: 'Primary code entry point.' },
      prerequisites: { type: 'string', maxLength: 1024, position: 8, description: 'Fixtures/preconditions.' },
      planCommit: { type: 'string', maxLength: 64, position: 9, description: 'TEST_PLAN.md git sha.' },
    },
    required: ['testId', 'title', 'tier', 'category', 'layer', 'implStatus'],
    additionalProperties: false,
  },
  testRun: {
    type: 'object',
    documentsMutable: false,
    canBeDeleted: false,
    creationRestrictionMode: 1,
    indices: [
      { name: 'testIdCreatedAt', properties: [{ testId: 'asc' }, { $createdAt: 'asc' }] },
      { name: 'resultCreatedAt', properties: [{ result: 'asc' }, { $createdAt: 'asc' }] },
      { name: 'buildRef', properties: [{ buildRef: 'asc' }] },
    ],
    properties: {
      testId: { type: 'string', minLength: 1, maxLength: 32, position: 0, description: 'Test identifier this run is a result for.' },
      result: { type: 'string', minLength: 1, maxLength: 16, position: 1, description: 'pass | fail | blocked | skipped.' },
      network: { type: 'string', minLength: 1, maxLength: 32, position: 2, description: 'Network executed against.' },
      buildRef: { type: 'string', minLength: 1, maxLength: 63, position: 3, description: 'Build under test.' },
      device: { type: 'string', maxLength: 128, position: 4, description: 'Device / simulator.' },
      evidence: { type: 'string', maxLength: 512, position: 5, description: 'txid / on-chain id / URL / path.' },
      notes: { type: 'string', maxLength: 2048, position: 6, description: 'Free-form notes.' },
      blockerReason: { type: 'string', maxLength: 512, position: 7, description: 'Why blocked/skipped.' },
    },
    required: ['testId', 'result', 'network', 'buildRef', '$createdAt'],
    additionalProperties: false,
  },
};

export function isDemo(contractId: string): boolean {
  return contractId.trim().toLowerCase() === 'demo';
}
