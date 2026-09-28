// Render propertyConstraints rules (protocol version 14) as short formulas,
// e.g. { "equal": [{ "add": ["a", "b"] }, 100] } -> "a + b = 100".
//
// Unknown operators render as `op(args)` so a newer keyword still reads.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

const COMPARISONS: Record<string, string> = {
  equal: '=',
  notEqual: '≠',
  lessThan: '<',
  lessThanOrEqual: '≤',
  greaterThan: '>',
  greaterThanOrEqual: '≥',
};

const INFIX: Record<string, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  modulo: 'mod',
  power: '^',
};

const FUNCTIONS: Record<string, string> = {
  length: 'length',
  byteLength: 'byteLength',
  count: 'count',
};

function literal(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  return JSON.stringify(v);
}

/** An expression: an integer, a path, or an operator object. */
export function renderExpression(e: unknown, parent?: string): string {
  if (typeof e === 'number' || typeof e === 'boolean') return String(e);
  if (typeof e === 'string') return e; // a property path, or $ownerId / $createdAt
  if (Array.isArray(e)) return `[${e.map((x) => renderExpression(x)).join(', ')}]`;
  if (!isObj(e)) return String(e);
  const [op, arg] = Object.entries(e)[0] ?? ['?', undefined];
  if (op === 'const') return literal(arg);
  if (op in INFIX && Array.isArray(arg)) {
    const text = arg.map((x) => renderExpression(x, op)).join(` ${INFIX[op]} `);
    return parent && parent !== op ? `(${text})` : text;
  }
  if (op === 'ifAbsent' && Array.isArray(arg)) {
    return `${renderExpression(arg[0])} ?? ${renderExpression(arg[1])}`;
  }
  if (op in FUNCTIONS) return `${FUNCTIONS[op]}(${renderExpression(arg)})`;
  return `${op}(${Array.isArray(arg) ? arg.map((x) => renderExpression(x)).join(', ') : renderExpression(arg)})`;
}

/** A condition: a comparison, in, present / absent, anyOf / allOf / not, … */
export function renderCondition(c: unknown, parent?: string): string {
  if (!isObj(c)) return renderExpression(c);
  const [op, arg] = Object.entries(c)[0] ?? ['?', undefined];

  if (op in COMPARISONS && Array.isArray(arg) && arg.length === 2) {
    return `${renderExpression(arg[0])} ${COMPARISONS[op]} ${renderExpression(arg[1])}`;
  }
  if (op === 'in' && Array.isArray(arg) && arg.length === 2) {
    const values = Array.isArray(arg[1]) ? arg[1].map(literal).join(', ') : renderExpression(arg[1]);
    return `${renderExpression(arg[0])} ∈ {${values}}`;
  }
  if (op === 'present') return `${renderExpression(arg)} is set`;
  if (op === 'absent') return `${renderExpression(arg)} is not set`;
  if (op === 'contains' && Array.isArray(arg) && arg.length === 2) {
    return `${renderExpression(arg[0])} contains ${renderExpression(arg[1])}`;
  }
  if ((op === 'startsWith' || op === 'endsWith') && Array.isArray(arg) && arg.length === 2) {
    return `${renderExpression(arg[0])} ${op === 'startsWith' ? 'starts with' : 'ends with'} ${renderExpression(arg[1])}`;
  }
  if ((op === 'anyOf' || op === 'allOf') && Array.isArray(arg)) {
    const joiner = op === 'anyOf' ? ' or ' : ' and ';
    const text = arg.map((x) => renderCondition(x, op)).join(joiner);
    return parent ? `(${text})` : text;
  }
  if (op === 'not') return `not ${renderCondition(arg, 'not')}`;
  return renderExpression(c);
}

/** The property paths a rule reads (for highlighting which fields it touches). */
export function constraintPaths(c: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, key?: string) => {
    if (typeof v === 'string') {
      if (key !== 'const') out.add(v);
      return;
    }
    if (Array.isArray(v)) {
      // The second operand of `in` (literal values) and of `ifAbsent` (a default) is not a path.
      v.forEach((x, i) => {
        if ((key === 'in' || key === 'ifAbsent') && i === 1) return;
        walk(x, key);
      });
      return;
    }
    if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(c);
  return [...out];
}
