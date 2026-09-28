// Read refersTo declarations (protocol version 14) and turn them into
// declared relationships plus the external nodes they point at.
//
// A declaration is one target ({ type, documentType, lookup, … }) or an
// anyOf / allOf of declarations. It sits on a property, on each element of a
// typed array (`items.refersTo`), or on the document type itself
// (`ownerRefersTo` / `creatorRefersTo`, which constrain the writer or creator).

import type {
  ContractModel,
  Entity,
  ExternalNode,
  Field,
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

function parseTarget(raw: Obj): RefTarget {
  const t: RefTarget = { type: String(raw.type) };
  if (typeof raw.documentType === 'string') t.documentType = raw.documentType;
  if (typeof raw.contractId === 'string') t.contractId = raw.contractId;
  const agreement = asStringMap(raw.propertyAgreement);
  if (agreement) t.propertyAgreement = agreement;
  if (isObj(raw.lookup) && typeof raw.lookup.index === 'string') {
    t.lookup = { index: raw.lookup.index, keys: asStringMap(raw.lookup.keys) ?? {} };
  }
  if (typeof raw.inList === 'string') t.inList = raw.inList;
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

const DOCUMENT_TARGETS = new Set(['permanentDocument', 'deletableDocument', 'listElement']);

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

/** What the reference matches on the target, for the edge's toField. */
function matchedOn(t: RefTarget): string {
  if (t.lookup) return t.lookup.index;
  if (t.inList) return t.inList;
  if (t.type === 'identityPublicKey') return 'key';
  return '$id';
}

export function describeTarget(t: RefTarget): string {
  const where = t.contractId ? ` of contract ${t.contractId}` : '';
  switch (t.type) {
    case 'identity':
      return 'the id of an existing identity';
    case 'contract':
      return 'the id of an existing data contract';
    case 'token':
      return 'the id of an existing token';
    case 'permanentDocument':
      return t.lookup
        ? `a "${t.documentType}" document${where} found through its unique index "${t.lookup.index}" (a type whose documents are never deleted)`
        : `the id of a "${t.documentType}" document${where}, a type whose documents are never deleted`;
    case 'deletableDocument':
      return t.lookup
        ? `a "${t.documentType}" document${where} found through its unique index "${t.lookup.index}"; checked again on every replace`
        : `the id of a "${t.documentType}" document${where} that can be deleted; checked again on every replace`;
    case 'listElement':
      return `one of the identifiers in "${t.inList}" of a "${t.documentType}" document${where}`;
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
          toField: matchedOn(target),
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
