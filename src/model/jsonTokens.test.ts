import { describe, expect, it } from 'vitest';
import { tokenizeJson } from './jsonTokens';

describe('tokenizeJson', () => {
  const text = JSON.stringify(
    { name: 'byShop', unique: false, countable: null, depth: -1.5e3, properties: [{ 'shop"Id': 'asc' }] },
    null,
    2,
  );
  const tokens = tokenizeJson(text);

  it('joins back into the text', () => {
    expect(tokens.map((t) => t.text).join('')).toBe(text);
  });

  it('tells keys from string values, and finds numbers and literals', () => {
    const of = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
    expect(of('key')).toEqual(['"name"', '"unique"', '"countable"', '"depth"', '"properties"', '"shop\\"Id"']);
    expect(of('string')).toEqual(['"byShop"', '"asc"']);
    expect(of('literal')).toEqual(['false', 'null']);
    expect(of('number')).toEqual(['-1500']);
  });
});
