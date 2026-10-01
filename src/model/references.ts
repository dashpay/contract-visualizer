// Read refersTo declarations (protocol version 14) and turn them into
// declared relationships plus the external nodes they point at.
//
// A declaration is one target ({ type, documentType, findBy, where, … }) or
// an anyOf / allOf of declarations. It sits on a property, on each element of
// a typed array (`items.refersTo`), or on the document type itself
// (`ownerRefersTo` / `creatorRefersTo`, which constrain the writer or creator).

import type {
  ContractModel,
  Entity,
  ExternalNode,
  Field,
  FindBySource,
  RefExpr,
  RefSite,
  RefTarget,
  Reference,
  Relationship,
} from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

const asStringMap = (v: unknown): Record<string, string> | undefined => {
  if (!isObj(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === 'string') out[k] = val;
  return out;
};

function asFindBy(v: unknown): Record<string, FindBySource> | undefined {
  if (!isObj(v)) return undefined;
  const out: Record<string, FindBySource> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
    else if (isObj(val) && typeof val.function === 'string') {
      out[k] = { function: val.function, params: Array.isArray(val.params) ? val.params : [] };
    }
  }
  return out;
}

function parseTarget(raw: Obj): RefTarget {
  const t: RefTarget = { type: String(raw.type) };
  if (typeof raw.documentType === 'string') t.documentType = raw.documentType;
  if (typeof raw.contractId === 'string') t.contractId = raw.contractId;
  const findBy = asFindBy(raw.findBy);
  if (findBy) t.findBy = findBy;
  const where = asStringMap(raw.where);
  if (where) t.where = where;
  if (typeof raw.inList === 'string') t.inList = raw.inList;
  if (typeof raw.minimumAgeBlocks === 'number') t.minimumAgeBlocks = raw.minimumAgeBlocks;
  if (raw.consume === true) t.consume = true;
  if (typeof raw.keyIdProperty === 'string') t.keyIdProperty = raw.keyIdProperty;
  if (typeof raw.identityProperty === 'string') t.identityProperty = raw.identityProperty;
  if (isObj(raw.keyRequirements)) {
    const kr = raw.keyRequirements;
    t.keyRequirements = {
      purpose: typeof kr.purpose === 'string' ? kr.purpose : undefined,
      boundTo: typeof kr.boundTo === 'string' ? kr.boundTo : undefined,
    };
  }
  if (isObj(raw.contractRequirements)) t.contractRequirements = { ...raw.contractRequirements };
  return t;
}

/** Parse a refersTo value. Returns undefined for anything that is not a declaration. */
export function parseRefExpr(raw: unknown): RefExpr | undefined {
  if (!isObj(raw)) return undefined;
  for (const op of ['anyOf', 'allOf'] as const) {
    if (Array.isArray(raw[op])) {
      const operands = (raw[op] as unknown[]).map(parseRefExpr).filter((e): e is RefExpr => !!e);
      return operands.length ? { op, operands } : undefined;
    }
  }
  if (typeof raw.type === 'string') return { op: 'target', target: parseTarget(raw) };
  return undefined;
}

export function makeReference(path: string, site: RefSite, raw: unknown): Reference | undefined {
  const expr = parseRefExpr(raw);
  return expr ? { path, site, expr, raw } : undefined;
}

/** The leaf targets of an expression, in declared order, with their anyOf / allOf position. */
export function flattenTargets(
  expr: RefExpr,
): Array<{ target: RefTarget; expression?: Relationship['expression'] }> {
  if (expr.op === 'target') return [{ target: expr.target }];
  const out: Array<{ target: RefTarget; expression?: Relationship['expression'] }> = [];
  expr.operands.forEach((operand, i) => {
    for (const leaf of flattenTargets(operand)) {
      // Nested expressions keep the outermost position: enough to tell branches apart on the canvas.
      out.push({ target: leaf.target, expression: leaf.expression ?? { op: expr.op, branch: i + 1, of: expr.operands.length } });
    }
  });
  return out;
}

const PLATFORM_NODES: Record<string, ExternalNode> = {
  identity: { id: 'platform:identity', kind: 'identity', label: 'Identity' },
  contract: { id: 'platform:contract', kind: 'contract', label: 'Data contract' },
  token: { id: 'platform:token', kind: 'token', label: 'Token' },
  identityPublicKey: { id: 'platform:identityPublicKey', kind: 'identityPublicKey', label: 'Identity key' },
};

const DOCUMENT_TARGETS = new Set(['permanentDocument', 'moderatedDocument', 'deletableDocument']);

export function isDocumentTarget(t: RefTarget): boolean {
  return DOCUMENT_TARGETS.has(t.type);
}

/** Resolve a target to the node an edge ends on; registers external nodes as it goes. */
function targetNode(
  t: RefTarget,
  model: ContractModel,
  externals: Map<string, ExternalNode>,
): string | undefined {
  if (isDocumentTarget(t)) {
    if (!t.documentType) return undefined;
    const foreign = t.contractId && t.contractId !== model.contractId;
    if (!foreign && model.entities.some((e) => e.name === t.documentType)) return t.documentType;
    const contractId = t.contractId ?? model.contractId ?? '?';
    const id = `external:${contractId}/${t.documentType}`;
    if (!externals.has(id)) {
      externals.set(id, { id, kind: 'externalDocument', label: t.documentType, contractId, documentType: t.documentType });
    }
    return id;
  }
  const node = PLATFORM_NODES[t.type];
  if (!node) return undefined;
  if (!externals.has(node.id)) externals.set(node.id, node);
  return node.id;
}

/** A findBy key computed by a function: a commit and reveal. */
export function findByFunction(t: RefTarget): { property: string; function: string; params: unknown[] } | undefined {
  for (const [property, source] of Object.entries(t.findBy ?? {})) {
    if (typeof source !== 'string') return { property, ...source };
  }
  return undefined;
}

/** findBy without inList: the document is found through a unique index, not by its id. */
export function findsByIndex(t: RefTarget): boolean {
  return !!t.findBy && !t.inList;
}

/**
 * The unique index a findBy resolves to: the one over exactly the properties
 * it names, in any order. Only known for a document type of this contract.
 */
export function findByIndex(t: RefTarget, model: ContractModel): string | undefined {
  if (!findsByIndex(t) || (t.contractId && t.contractId !== model.contractId)) return undefined;
  const keys = new Set(Object.keys(t.findBy ?? {}));
  const entity = model.entities.find((e) => e.name === t.documentType);
  const index = entity?.indices.find(
    (i) => i.unique && i.fields.length === keys.size && i.fields.every((f) => keys.has(f.field)),
  );
  return index?.name;
}

/** What the reference matches on the target, for the edge's toField. */
function matchedOn(t: RefTarget, model: ContractModel): string {
  if (t.inList) return t.inList;
  if (t.findBy) return findByIndex(t, model) ?? `(${Object.keys(t.findBy).join(', ')})`;
  if (t.type === 'identityPublicKey') return 'key';
  return '$id';
}

/** One findBy source in words. */
export function sourceText(source: FindBySource): string {
  if (typeof source !== 'string') return `${source.function}(${source.params.map((p) => (isObj(p) && 'const' in p ? JSON.stringify(p.const) : String(p))).join(', ')})`;
  if (source === '.') return 'this value';
  if (source === '$ownerId') return 'the writer';
  return source;
}

const findByText = (t: RefTarget) =>
  Object.entries(t.findBy ?? {})
    .map(([k, v]) => `${k} = ${sourceText(v)}`)
    .join(', ');

/** The where entries in words: what the referenced document must hold. */
export function whereText(t: RefTarget): string {
  return Object.entries(t.where ?? {})
    .map(([there, here]) => `its ${there} = ${here === '$ownerId' ? 'the writer' : here}`)
    .join(', ');
}

export function describeTarget(t: RefTarget): string {
  const of = t.contractId ? ` of contract ${t.contractId}` : '';
  const where = t.where ? ` with ${whereText(t)}` : '';
  const fn = findByFunction(t);
  switch (t.type) {
    case 'identity':
      return 'the id of an existing identity';
    case 'contract':
      return 'the id of an existing data contract';
    case 'token':
      return 'the id of an existing token';
    case 'permanentDocument':
      if (t.inList) {
        const holder = typeof t.findBy?.$id === 'string' ? ` whose id is in "${t.findBy.$id}"` : '';
        return `one of the identifiers in "${t.inList}" of the "${t.documentType}" document${of}${holder}${where}`;
      }
      return t.findBy
        ? `a "${t.documentType}" document${of} found by ${findByText(t)}${where} (a type whose documents are never deleted)`
        : `the id of a "${t.documentType}" document${of}${where}, a type whose documents are never deleted`;
    case 'moderatedDocument':
      return `the id of a "${t.documentType}" document${of}${where}, a type whose documents leave only through a moderator's recorded removal; a replace may keep it once removed`;
    case 'deletableDocument':
      if (fn) {
        return `a "${t.documentType}" commitment${of} found by ${findByText(t)}${where}, revealed on the create alone${t.consume ? ' and deleted by it' : ''}`;
      }
      return t.findBy
        ? `a "${t.documentType}" document${of} found by ${findByText(t)}${where}; checked again on every replace`
        : `the id of a "${t.documentType}" document${of}${where} that can be deleted; checked again on every replace`;
    case 'identityPublicKey':
      return t.keyIdProperty
        ? `the id of an identity whose key with the id in "${t.keyIdProperty}" exists and is not disabled`
        : `a key id of the identity in "${t.identityProperty ?? '$ownerId'}"; that key must exist and not be disabled`;
    default:
      return `a "${t.type}" reference`;
  }
}

function siteLabel(site: RefSite, path: string): string {
  switch (site) {
    case 'owner':
      return 'the document owner (ownerRefersTo)';
    case 'creator':
      return 'the document creator (creatorRefersTo)';
    case 'element':
      return `each element of ${path.replace(/\[\]$/, '')}`;
    default:
      return path;
  }
}

function collect(entity: Entity): Array<{ ref: Reference; field?: Field }> {
  const out: Array<{ ref: Reference; field?: Field }> = entity.typeReferences.map((ref) => ({ ref }));
  for (const f of entity.fields) if (f.reference) out.push({ ref: f.reference, field: f });
  return out;
}

/** Declared relationships and the external nodes they reach. */
export function declaredRelationships(model: ContractModel): {
  relationships: Relationship[];
  externals: ExternalNode[];
} {
  const externals = new Map<string, ExternalNode>();
  const relationships: Relationship[] = [];
  const seen = new Set<string>();

  for (const entity of model.entities) {
    for (const { ref, field } of collect(entity)) {
      for (const { target, expression } of flattenTargets(ref.expr)) {
        const to = targetNode(target, model, externals);
        if (!to) continue;
        const fromField = ref.path.replace(/\[\]$/, '');
        const id = `ref:${entity.name}.${ref.path}->${to}#${target.type}${expression ? `@${expression.branch}` : ''}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const who = siteLabel(ref.site, ref.path);
        const prefix = expression ? `${expression.op} ${expression.branch}/${expression.of}: ` : '';
        relationships.push({
          id,
          kind: 'declared',
          from: entity.name,
          to,
          fromField,
          toField: matchedOn(target, model),
          confidence: 'high',
          reason: `${prefix}${who} must be ${describeTarget(target)}`,
          site: ref.site,
          target,
          expression,
          optional: ref.site === 'property' || ref.site === 'element' ? !field?.required : false,
        });
      }
    }
  }
  return { relationships, externals: [...externals.values()] };
}

/** Field paths that carry a declaration (so the naming heuristics skip them). */
export function declaredFieldPaths(entity: Entity): Set<string> {
  const out = new Set<string>();
  for (const f of entity.fields) if (f.reference) out.add(f.path);
  return out;
}
