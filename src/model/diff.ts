// Compare two versions of a contract: what was added, removed or changed at
// every level (contract, document type, property, index, property
// constraint, reference), each change judged by the update rules
// (updateRules.ts). Also builds the union of both models, which the canvas
// draws with each element coloured by its status.

import { modelFromPastedJson } from './introspect';
import { withRelationships } from './relationships';
import {
  addedRequiredSinceRefusal,
  configKeyRefusal,
  constraintRefusal,
  contractRefusals,
  indexRefusal,
  propertyKeyRefusal,
  removedPropertyRefusal,
  removedTypeRefusal,
  requiredRefusals,
  sameJson,
  schemaDefRefusal,
  tokenOrGroupRefusal,
  typeKeyRefusal,
  type Refusal,
} from './updateRules';
import type { ContractModel, Entity, Field, Index } from './types';

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface KeyChange {
  key: string;
  before?: unknown;
  after?: unknown;
  refusal?: Refusal;
}

export interface Change {
  id: string;
  kind: ChangeKind;
  scope: 'contract' | 'type' | 'field' | 'index' | 'rule';
  entity?: string;
  /** Field path, index name, rule name, or the contract-level key. */
  target?: string;
  title: string;
  keys: KeyChange[];
  refusals: Refusal[];
  before?: unknown;
  after?: unknown;
}

/** Element keys: `${entity}` for a type, `${entity}::${path|name}` for its parts. */
export interface DiffStatus {
  entities: Record<string, ChangeKind>;
  fields: Record<string, ChangeKind>;
  indices: Record<string, ChangeKind>;
  rules: Record<string, ChangeKind>;
  relationships: Record<string, ChangeKind>;
  /** Element keys (same shapes, prefixed 'type:', 'field:', 'index:', 'rule:') with a 'refused' finding. */
  refused: Set<string>;
}

export interface ContractDiff {
  base: ContractModel;
  head: ContractModel;
  merged: ContractModel;
  changes: Change[];
  status: DiffStatus;
  summary: {
    changes: number;
    refused: number;
    checks: number;
    typesAdded: number;
    typesRemoved: number;
    typesChanged: number;
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
/** The key of a field, index or rule in `DiffStatus`. */
export const key2 = (entity: string, part: string) => `${entity}::${part}`;
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Structural keys of a document type, diffed on their own. */
const TYPE_STRUCTURE = new Set(['properties', 'indices', 'required', 'propertyConstraints']);

function keyChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  skip: Set<string>,
  judge: (key: string, b: unknown, a: unknown) => Refusal | undefined,
): KeyChange[] {
  const out: KeyChange[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    if (skip.has(key)) continue;
    const b = before[key];
    const a = after[key];
    if (sameJson(b, a)) continue;
    out.push({ key, before: b, after: a, refusal: judge(key, b, a) });
  }
  return out;
}

function propertyChanges(before: Record<string, unknown>, after: Record<string, unknown>): KeyChange[] {
  const out = keyChanges(before, after, new Set(['items']), (k, b, a) => propertyKeyRefusal(k, b, a, { before, after }));
  const bi = before.items;
  const ai = after.items;
  if (!sameJson(bi, ai)) {
    if (isObj(bi) && isObj(ai)) {
      // The element of a typed array: each keyword follows its own rule.
      for (const c of keyChanges(bi, ai, new Set(), (k, b, a) => propertyKeyRefusal(k, b, a, { before: bi, after: ai, element: true }))) {
        out.push({ ...c, key: `items.${c.key}` });
      }
    } else {
      out.push({ key: 'items', before: bi, after: ai, refusal: propertyKeyRefusal('items', bi, ai, { before, after }) });
    }
  }
  return out;
}

const userFields = (e: Entity) => e.fields.filter((f) => !f.system);

function mergeFields(head: Field[], base: Field[], removed: Set<string>): Field[] {
  const out = [...head];
  // Insert each removed field after its nearest preceding base sibling still present.
  base.forEach((f, i) => {
    if (!removed.has(f.path)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.findIndex((x) => x.path === base[j].path);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    out.splice(at, 0, f);
  });
  return out;
}

function diffEntity(
  base: Entity,
  head: Entity,
  headVersion: number | undefined,
  changes: Change[],
  status: DiffStatus,
): Entity {
  const name = head.name;
  const before = base.schema;
  const after = head.schema;
  const typeChange: Change = { id: `type:${name}`, kind: 'changed', scope: 'type', entity: name, title: `document type ${name}`, keys: [], refusals: [] };

  // Document type keywords.
  typeChange.keys.push(
    ...keyChanges(before, after, TYPE_STRUCTURE, (k, b, a) => typeKeyRefusal(k, b, a, { base: before, head: after })),
  );

  // Properties.
  const bf = new Map(userFields(base).map((f) => [f.path, f]));
  const hf = new Map(userFields(head).map((f) => [f.path, f]));
  const fieldChanges = new Map<string, Change>();
  const removed = new Set<string>();
  for (const [path, f] of bf) {
    if (hf.has(path)) continue;
    removed.add(path);
    status.fields[key2(name, path)] = 'removed';
    const parent = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : undefined;
    if (parent && !hf.has(parent)) continue; // the parent's removal says it
    fieldChanges.set(path, { id: `field:${name}:${path}`, kind: 'removed', scope: 'field', entity: name, target: path, title: `${name}.${path}`, keys: [], refusals: [removedPropertyRefusal()], before: f.written });
  }
  const addedWithRequiredSince = new Set<string>();
  for (const [path, f] of hf) {
    const old = bf.get(path);
    if (!old) {
      status.fields[key2(name, path)] = 'added';
      const r = addedRequiredSinceRefusal(f.written.requiredSince, headVersion);
      if (f.depth === 0 && f.written.requiredSince !== undefined && !r) addedWithRequiredSince.add(path);
      fieldChanges.set(path, { id: `field:${name}:${path}`, kind: 'added', scope: 'field', entity: name, target: path, title: `${name}.${path}`, keys: [], refusals: r ? [r] : [], after: f.written });
      continue;
    }
    const keys = propertyChanges(old.written, f.written);
    if (keys.length) {
      status.fields[key2(name, path)] = 'changed';
      fieldChanges.set(path, { id: `field:${name}:${path}`, kind: 'changed', scope: 'field', entity: name, target: path, title: `${name}.${path}`, keys, refusals: [] });
    }
  }

  // required: gains must be added properties with requiredSince; no losses.
  const bReq = strings(before.required);
  const hReq = strings(after.required);
  for (const { name: n, refusal } of requiredRefusals(bReq, hReq, addedWithRequiredSince)) {
    const kc: KeyChange = { key: 'required', before: bReq.includes(n) ? n : undefined, after: hReq.includes(n) ? n : undefined, refusal };
    const fc = fieldChanges.get(n);
    if (fc) fc.keys.push(kc);
    else typeChange.keys.push(kc);
  }
  for (const n of hReq.filter((x) => !bReq.includes(x) && !fieldChanges.get(x))) {
    if (!typeChange.keys.some((k) => k.key === 'required' && k.after === n)) typeChange.keys.push({ key: 'required', after: n });
  }

  for (const c of fieldChanges.values()) {
    for (const k of c.keys) if (k.refusal) c.refusals.push(k.refusal);
    changes.push(c);
  }

  // Indexes, by name.
  const bi = new Map(base.indices.map((i) => [i.name, i]));
  const hi = new Map(head.indices.map((i) => [i.name, i]));
  const removedIndices: Index[] = [];
  for (const [n, idx] of bi) {
    if (hi.has(n)) continue;
    removedIndices.push(idx);
    status.indices[key2(name, n)] = 'removed';
    changes.push({ id: `index:${name}:${n}`, kind: 'removed', scope: 'index', entity: name, target: n, title: `${name} index ${n}`, keys: [], refusals: [indexRefusal('removed')], before: idx.written });
  }
  for (const [n, idx] of hi) {
    const old = bi.get(n);
    if (!old) {
      status.indices[key2(name, n)] = 'added';
      changes.push({ id: `index:${name}:${n}`, kind: 'added', scope: 'index', entity: name, target: n, title: `${name} index ${n}`, keys: [], refusals: [indexRefusal('added')], after: idx.written });
    } else if (!sameJson(old.written, idx.written)) {
      status.indices[key2(name, n)] = 'changed';
      const keys = keyChanges(old.written, idx.written, new Set(['name']), () => undefined);
      changes.push({ id: `index:${name}:${n}`, kind: 'changed', scope: 'index', entity: name, target: n, title: `${name} index ${n}`, keys, refusals: [indexRefusal('changed')] });
    }
  }

  // propertyConstraints rules, by name.
  const br = base.propertyConstraints;
  const hr = head.propertyConstraints;
  const removedRules: Record<string, unknown> = {};
  for (const n of new Set([...Object.keys(br), ...Object.keys(hr)])) {
    const b = br[n];
    const a = hr[n];
    if (sameJson(b, a)) continue;
    const kind: ChangeKind = b === undefined ? 'added' : a === undefined ? 'removed' : 'changed';
    status.rules[key2(name, n)] = kind;
    if (kind === 'removed') removedRules[n] = b;
    changes.push({ id: `rule:${name}:${n}`, kind, scope: 'rule', entity: name, target: n, title: `${name} rule ${n}`, keys: [], refusals: [constraintRefusal()], before: b, after: a });
  }

  if (typeChange.keys.length) {
    for (const k of typeChange.keys) if (k.refusal) typeChange.refusals.push(k.refusal);
    changes.push(typeChange);
  }

  return {
    ...head,
    fields: mergeFields(head.fields, base.fields, removed),
    indices: [...head.indices, ...removedIndices],
    propertyConstraints: { ...hr, ...removedRules },
  };
}

/**
 * config with the platform's defaults filled in, so a contract that states a
 * default and one that leaves it out compare equal (a fetched contract writes
 * every key; a file usually omits them). Integers are sized from config
 * format 1 on.
 */
export function normalizeConfig(config: Record<string, unknown> | undefined): Record<string, unknown> {
  const c = config ?? {};
  const defaults: Record<string, unknown> = {
    canBeDeleted: false,
    readonly: false,
    keepsHistory: false,
    documentsKeepHistoryContractDefault: false,
    documentsMutableContractDefault: true,
    documentsCanBeDeletedContractDefault: true,
    requiresIdentityEncryptionBoundedKey: null,
    requiresIdentityDecryptionBoundedKey: null,
    sizedIntegerTypes: c.$formatVersion !== '0',
  };
  const out: Record<string, unknown> = { ...defaults };
  for (const [k, v] of Object.entries(c)) if (v !== undefined && k !== '$formatVersion') out[k] = v ?? defaults[k] ?? null;
  return out;
}

function contractChange(base: ContractModel, head: ContractModel, typesChanged: boolean): Change[] {
  const out: Change[] = [];
  const c: Change = { id: 'contract', kind: 'changed', scope: 'contract', title: 'contract', keys: [], refusals: [] };
  if (base.version !== head.version) c.keys.push({ key: 'version', before: base.version, after: head.version });
  if (base.ownerId && head.ownerId && base.ownerId !== head.ownerId) c.keys.push({ key: 'ownerId', before: base.ownerId, after: head.ownerId });
  const bc = normalizeConfig(base.config);
  const hc = normalizeConfig(head.config);
  for (const k of keyChanges(bc, hc, new Set(['$formatVersion']), configKeyRefusal)) c.keys.push({ ...k, key: `config.${k.key}` });
  if (!sameJson(base.keywords, head.keywords)) c.keys.push({ key: 'keywords', before: base.keywords, after: head.keywords });
  if (base.description !== head.description) c.keys.push({ key: 'description', before: base.description, after: head.description });

  const collections: Array<[string, Record<string, unknown> | undefined, Record<string, unknown> | undefined, (b: unknown, a: unknown) => Refusal | undefined]> = [
    ['schemaDefs', base.schemaDefs, head.schemaDefs, schemaDefRefusal],
    ['tokens', base.tokens, head.tokens, (b, a) => tokenOrGroupRefusal('token', b, a)],
    ['groups', base.groups, head.groups, (b, a) => tokenOrGroupRefusal('group', b, a)],
  ];
  for (const [label, b, a, judge] of collections) {
    const bb = b ?? {};
    const aa = a ?? {};
    for (const n of new Set([...Object.keys(bb), ...Object.keys(aa)])) {
      if (sameJson(bb[n], aa[n])) continue;
      const kind: ChangeKind = bb[n] === undefined ? 'added' : aa[n] === undefined ? 'removed' : 'changed';
      const r = judge(bb[n], aa[n]);
      out.push({ id: `${label}:${n}`, kind, scope: 'contract', target: `${label}.${n}`, title: `${label}.${n}`, keys: [], refusals: r ? [r] : [], before: bb[n], after: aa[n] });
    }
  }
  // The version and readonly rules apply only to an actual update.
  const changed = typesChanged || out.length > 0 || c.keys.some((k) => k.key !== 'version');
  c.refusals.push(...contractRefusals(base, head, changed));
  for (const k of c.keys) if (k.refusal) c.refusals.push(k.refusal);
  if (c.keys.length || c.refusals.length) out.unshift(c);
  return out;
}

/** Diff two parsed models. */
export function diffModels(base: ContractModel, head: ContractModel): ContractDiff {
  const changes: Change[] = [];
  const status: DiffStatus = { entities: {}, fields: {}, indices: {}, rules: {}, relationships: {}, refused: new Set() };

  const baseTypes = new Map(base.entities.map((e) => [e.name, e]));
  const headTypes = new Map(head.entities.map((e) => [e.name, e]));
  const entities: Entity[] = [];
  let typesAdded = 0;
  let typesRemoved = 0;
  let typesChanged = 0;

  for (const e of head.entities) {
    const old = baseTypes.get(e.name);
    if (!old) {
      typesAdded++;
      status.entities[e.name] = 'added';
      for (const f of e.fields) status.fields[key2(e.name, f.path)] = 'added';
      const refusals = userFields(e)
        .map((f) => addedRequiredSinceRefusal(f.written.requiredSince, head.version))
        .filter((r): r is Refusal => !!r);
      changes.push({ id: `type:${e.name}`, kind: 'added', scope: 'type', entity: e.name, title: `document type ${e.name}`, keys: [], refusals, after: e.schema });
      entities.push(e);
      continue;
    }
    const before = changes.length;
    const merged = diffEntity(old, e, head.version, changes, status);
    if (changes.length > before) {
      typesChanged++;
      status.entities[e.name] = 'changed';
    }
    entities.push(merged);
  }
  for (const e of base.entities) {
    if (headTypes.has(e.name)) continue;
    typesRemoved++;
    status.entities[e.name] = 'removed';
    for (const f of e.fields) status.fields[key2(e.name, f.path)] = 'removed';
    for (const i of e.indices) status.indices[key2(e.name, i.name)] = 'removed';
    for (const r of Object.keys(e.propertyConstraints)) status.rules[key2(e.name, r)] = 'removed';
    changes.push({ id: `type:${e.name}`, kind: 'removed', scope: 'type', entity: e.name, title: `document type ${e.name}`, keys: [], refusals: [removedTypeRefusal()], before: e.schema });
    entities.push(e);
  }

  changes.unshift(...contractChange(base, head, changes.length > 0));

  // Relationships, by id (declared ones carry field, target and operand).
  const baseRels = new Map(base.relationships.map((r) => [r.id, r]));
  const headRels = new Set(head.relationships.map((r) => r.id));
  for (const r of head.relationships) if (!baseRels.has(r.id)) status.relationships[r.id] = 'added';
  const removedRels = base.relationships.filter((r) => !headRels.has(r.id));
  for (const r of removedRels) status.relationships[r.id] = 'removed';

  const externals = new Map(head.externals.map((n) => [n.id, n]));
  for (const n of base.externals) if (!externals.has(n.id)) externals.set(n.id, n);

  // Which elements carry a refusal.
  for (const c of changes) {
    if (!c.refusals.some((r) => r.severity === 'refused')) continue;
    if (c.scope === 'type' && c.entity) status.refused.add(`type:${c.entity}`);
    if (c.scope === 'field' && c.entity) status.refused.add(`field:${key2(c.entity, c.target!)}`);
    if (c.scope === 'index' && c.entity) status.refused.add(`index:${key2(c.entity, c.target!)}`);
    if (c.scope === 'rule' && c.entity) status.refused.add(`rule:${key2(c.entity, c.target!)}`);
  }

  const all = changes.flatMap((c) => c.refusals);
  return {
    base,
    head,
    merged: { ...head, entities, externals: [...externals.values()], relationships: [...head.relationships, ...removedRels] },
    changes,
    status,
    summary: {
      changes: changes.length,
      refused: all.filter((r) => r.severity === 'refused').length,
      checks: all.filter((r) => r.severity === 'check').length,
      typesAdded,
      typesRemoved,
      typesChanged,
    },
  };
}

/** Diff two contract JSON values (fetched, pasted, or files). */
export function diffContracts(baseJson: unknown, headJson: unknown): ContractDiff {
  return diffModels(withRelationships(modelFromPastedJson(baseJson)), withRelationships(modelFromPastedJson(headJson)));
}
