import { describe, expect, it } from 'vitest';
import { constraintPaths, renderCondition } from './constraints';

// Rules from the propertyConstraints chapter of the Dash Platform Book.
describe('renderCondition', () => {
  it('renders arithmetic inside a comparison', () => {
    expect(renderCondition({ equal: [{ add: ['rewardSplit.leader', 'rewardSplit.equal', 'rewardSplit.actions'] }, 100] })).toBe(
      'rewardSplit.leader + rewardSplit.equal + rewardSplit.actions = 100',
    );
  });

  it('parenthesises a nested operator of another kind', () => {
    expect(renderCondition({ lessThan: [{ multiply: [{ add: ['a', 'b'] }, 2] }, 'c'] })).toBe('(a + b) × 2 < c');
  });

  it('renders anyOf / allOf / not with present, absent, in and const', () => {
    expect(renderCondition({ anyOf: [{ notEqual: ['status', { const: 'closed' }] }, { present: 'closedAt' }] })).toBe(
      'status ≠ "closed" or closedAt is set',
    );
    expect(renderCondition({ not: { allOf: [{ equal: ['price', 0] }, { greaterThan: ['quantity', 10] }] } })).toBe(
      'not (price = 0 and quantity > 10)',
    );
    expect(renderCondition({ in: ['fee', [0, 10, 25, 50]] })).toBe('fee ∈ {0, 10, 25, 50}');
    expect(
      renderCondition({ anyOf: [{ allOf: [{ present: 'street' }, { present: 'city' }] }, { allOf: [{ absent: 'street' }, { absent: 'city' }] }] }),
    ).toBe('(street is set and city is set) or (street is not set and city is not set)');
  });

  it('renders ifAbsent, length and count', () => {
    expect(renderCondition({ lessThan: [{ ifAbsent: ['salePrice', 0] }, 'price'] })).toBe('salePrice ?? 0 < price');
    expect(renderCondition({ greaterThanOrEqual: [{ length: 'body' }, 20] })).toBe('length(body) ≥ 20');
    expect(renderCondition({ lessThanOrEqual: [{ count: 'tags' }, 5] })).toBe('count(tags) ≤ 5');
  });

  it('keeps an unknown operator readable', () => {
    expect(renderCondition({ someFutureOp: ['a', 1] })).toBe('someFutureOp(a, 1)');
  });
});

describe('constraintPaths', () => {
  it('lists the properties a rule reads, not its literals', () => {
    expect(constraintPaths({ anyOf: [{ not: { in: ['reason', ['scam', 'counterfeit']] } }, { present: 'details' }] })).toEqual([
      'reason',
      'details',
    ]);
    expect(constraintPaths({ equal: [{ ifAbsent: ['status', 'open'] }, { const: 'open' }] })).toEqual(['status']);
  });
});
