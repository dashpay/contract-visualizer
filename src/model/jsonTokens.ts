// Splits pretty-printed JSON into tokens for light syntax highlighting: keys,
// strings, numbers, literals (true, false, null) and everything else
// (punctuation and whitespace), kept verbatim so the tokens join back into
// the text.

export type JsonTokenKind = 'key' | 'string' | 'number' | 'literal' | 'plain';

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ kind: 'plain', text: text.slice(last, at) });
    const [whole, string, colon, number, literal] = match;
    if (string !== undefined) {
      tokens.push({ kind: colon ? 'key' : 'string', text: string });
      if (colon) tokens.push({ kind: 'plain', text: colon });
    } else if (number !== undefined) {
      tokens.push({ kind: 'number', text: number });
    } else if (literal !== undefined) {
      tokens.push({ kind: 'literal', text: literal });
    } else {
      tokens.push({ kind: 'plain', text: whole });
    }
    last = at + whole.length;
  }
  if (last < text.length) tokens.push({ kind: 'plain', text: text.slice(last) });
  return tokens;
}
