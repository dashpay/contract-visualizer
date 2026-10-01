// Turn a contract's document schemas into a ContractModel.
//
// Input is the parsed document schemas record (docTypeName -> JSON schema),
// from a fetched contract's toJSON(), a pasted contract or a bundled example.
// We never need a platform version: every keyword is read from the raw schema.

import { makeReference } from './references';
import type { ContractModel, EncryptedFor, Entity, Field, Index, IndexField, Reference } from './types';

type Schema = Record<string, unknown>;
type Props = Record<string, Record<string, unknown>>;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const SYSTEM_FIELD_TYPE: Record<string, string> = {
  $id: 'identifier',
  $ownerId: 'identifier',
  $creatorId: 'identifier',
  $revision: 'integer',
  $createdAt: 'timestamp',
  $updatedAt: 'timestamp',
  $transferredAt: 'timestamp',
  $createdAtBlockHeight: 'height',
  $updatedAtBlockHeight: 'height',
  $transferredAtBlockHeight: 'height',
  $createdAtCoreBlockHeight: 'core height',
  $updatedAtCoreBlockHeight: 'core height',
  $transferredAtCoreBlockHeight: 'core height',
};
// Stable display order for system fields appended after user properties.
const SYSTEM_ORDER = Object.keys(SYSTEM_FIELD_TYPE);

/** Document type keys that are structure, not settings. Everything else lands in Entity.config. */
const STRUCTURAL_KEYS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'indices',
  'transient',
  'immutable',
  'entryPayload',
  'ownerRefersTo',
  'creatorRefersTo',
  'propertyConstraints',
  'description',
  '$comment',
  '$schema',
  '$defs',
]);

const CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'maxBytes',
  'pattern',
  'format',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'contains',
  'minProperties',
  'maxProperties',
  'dependentRequired',
  'contentMediaType',
];

const IDENTIFIER_MEDIA = 'application/x.dash.dpp.identifier';

/**
 * A property exactly as the document type writes it, members included, by
 * its dotted path (property names hold no dots). Undefined for a path the
 * schema does not have, such as a system field.
 */
export function writtenProperty(schema: Record<string, unknown>, path: string): Record<string, unknown> | undefined {
  let prop: unknown = schema;
  for (const name of path.split('.')) {
    const properties = isObj(prop) ? prop.properties : undefined;
    prop = isObj(properties) ? properties[name] : undefined;
  }
  return isObj(prop) ? prop : undefined;
}

export function isIdentifierProp(prop: Record<string, unknown> | undefined): boolean {
  if (!prop) return false;
  if (prop.type !== 'array' || prop.byteArray !== true) return false;
  const media = typeof prop.contentMediaType === 'string' ? prop.contentMediaType : '';
  return media.includes('identifier');
}

/** Best-effort display type for a JSON-schema property (already $ref-resolved). */
function displayType(prop: Record<string, unknown>): string {
  const t = prop.type;
  if (t === 'array') {
    if (prop.byteArray === true) return isIdentifierProp(prop) ? 'identifier' : 'bytes';
    const items = isObj(prop.items) ? prop.items : undefined;
    if (!items) return 'array';
    if (items.type === 'array' && items.byteArray === true) return isIdentifierProp(items) ? 'identifier[]' : 'bytes[]';
    return `${typeof items.type === 'string' ? items.type : 'any'}[]`;
  }
  return typeof t === 'string' ? t : 'object';
}

function pickConstraints(prop: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // An identifier is always 32 bytes; its type says so already.
  const identifier = isIdentifierProp(prop);
  for (const k of CONSTRAINT_KEYS) {
    if (prop[k] === undefined) continue;
    if (k === 'contentMediaType' && prop[k] === IDENTIFIER_MEDIA) continue;
    if (identifier && (k === 'minItems' || k === 'maxItems') && prop[k] === 32) continue;
    out[k] = prop[k];
  }
  return out;
}

/** Resolve a `$ref: "#/$defs/<name>"` against schemaDefs; the property's own keys win. */
function resolveRef(
  prop: Record<string, unknown>,
  defs: Record<string, unknown> | undefined,
): { prop: Record<string, unknown>; ref?: string } {
  const ref = typeof prop.$ref === 'string' ? prop.$ref : undefined;
  if (!ref) return { prop };
  const name = ref.replace(/^#\/\$defs\//, '');
  const def = defs && isObj(defs[name]) ? (defs[name] as Record<string, unknown>) : undefined;
  if (!def) return { prop, ref: name };
  const { $ref: _drop, ...own } = prop;
  return { prop: { ...def, ...own }, ref: name };
}

function parseIndices(schema: Schema): Index[] {
  const raw = Array.isArray(schema.indices) ? (schema.indices as Array<Record<string, unknown>>) : [];
  return raw.map((idx) => {
    const propsArr = Array.isArray(idx.properties) ? (idx.properties as Array<Record<string, string>>) : [];
    const fields: IndexField[] = propsArr.map((entry) => {
      const [field, dir] = Object.entries(entry)[0] ?? ['?', 'asc'];
      return { field, direction: dir === 'desc' ? 'desc' : 'asc' };
    });
    const { name, properties: _p, unique, ...options } = idx;
    return {
      name: typeof name === 'string' ? name : fields.map((f) => f.field).join('+'),
      fields,
      unique: unique === true,
      options,
      written: idx,
    };
  });
}

function stringList(v: unknown): Set<string> {
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
}

function encryptedFor(v: unknown): EncryptedFor | undefined {
  if (!isObj(v) || typeof v.recipient !== 'string') return undefined;
  return {
    recipient: v.recipient,
    recipientKey: typeof v.recipientKey === 'string' ? v.recipientKey : undefined,
    senderKey: typeof v.senderKey === 'string' ? v.senderKey : undefined,
    scheme: typeof v.scheme === 'string' ? v.scheme : undefined,
  };
}

interface Marks {
  indexed: Set<string>;
  unique: Set<string>;
  immutable: Set<string>;
  /** The condition of an `immutable` entry `{ property, when }`, by property. */
  immutableWhen: Map<string, unknown>;
  transient: Set<string>;
  entryPayload: Set<string>;
  /** moderatorAbilities.changeFields. */
  moderatorOnly: Set<string>;
}

/** `immutable` entries: a property name, or `{ property, when }` frozen while the condition holds. */
export function immutableEntries(v: unknown): { names: Set<string>; when: Map<string, unknown> } {
  const names = new Set<string>();
  const when = new Map<string, unknown>();
  for (const entry of Array.isArray(v) ? v : []) {
    if (typeof entry === 'string') names.add(entry);
    else if (isObj(entry) && typeof entry.property === 'string') {
      names.add(entry.property);
      when.set(entry.property, entry.when);
    }
  }
  return { names, when };
}

function generatedFrom(v: unknown): Field['generatedFrom'] {
  if (!isObj(v) || typeof v.function !== 'string') return undefined;
  return { function: v.function, params: Array.isArray(v.params) ? v.params.filter((p): p is string => typeof p === 'string') : [] };
}

/** Push one property (and, for an object, its members) onto `out`, depth-first in position order. */
function pushProperties(
  out: Field[],
  properties: Props,
  required: Set<string>,
  prefix: string,
  depth: number,
  marks: Marks,
  defs: Record<string, unknown> | undefined,
): void {
  const byPosition = Object.keys(properties).sort((a, b) => {
    const pa = Number(properties[a]?.position ?? 1e9);
    const pb = Number(properties[b]?.position ?? 1e9);
    return pa - pb;
  });
  for (const name of byPosition) {
    const { properties: _members, ...written } = properties[name] ?? {};
    const { prop, ref } = resolveRef(properties[name] ?? {}, defs);
    const path = prefix ? `${prefix}.${name}` : name;
    const items = isObj(prop.items) ? prop.items : undefined;
    const top = depth === 0;

    let reference: Reference | undefined;
    if (prop.refersTo !== undefined) reference = makeReference(path, 'property', prop.refersTo);
    else if (items?.refersTo !== undefined) reference = makeReference(`${path}[]`, 'element', items.refersTo);

    const distinct = typeof prop.distinctFrom === 'string'
      ? prop.distinctFrom
      : typeof items?.distinctFrom === 'string'
        ? items.distinctFrom
        : undefined;

    out.push({
      name,
      path,
      depth,
      type: displayType(prop),
      required: required.has(name),
      system: false,
      position: typeof prop.position === 'number' ? prop.position : undefined,
      indexed: marks.indexed.has(path),
      unique: marks.unique.has(path),
      constraints: pickConstraints(prop),
      items: items ? pickConstraints(items) : undefined,
      ref,
      description: typeof prop.description === 'string' ? prop.description : undefined,
      reference,
      distinctFrom: distinct,
      encryptedFor: encryptedFor(prop.encryptedFor),
      immutable: top && marks.immutable.has(name) ? true : undefined,
      immutableWhen: top ? marks.immutableWhen.get(name) : undefined,
      generatedFrom: generatedFrom(prop.generatedFrom),
      moderatorOnly: top && marks.moderatorOnly.has(name) ? true : undefined,
      transient: top && marks.transient.has(name) ? true : undefined,
      requiredSince: typeof prop.requiredSince === 'number' ? prop.requiredSince : undefined,
      entryPayload: top && marks.entryPayload.has(name) ? true : undefined,
      written,
    });

    if (prop.type === 'object' && isObj(prop.properties)) {
      pushProperties(out, prop.properties as Props, stringList(prop.required), path, depth + 1, marks, defs);
    }
  }
}

function buildEntity(name: string, schema: Schema, defs: Record<string, unknown> | undefined): Entity {
  const properties: Props = isObj(schema.properties) ? (schema.properties as Props) : {};
  const required = stringList(schema.required);
  const indices = parseIndices(schema);

  const immutable = immutableEntries(schema.immutable);
  const abilities = isObj(schema.moderatorAbilities) ? schema.moderatorAbilities : {};
  const marks: Marks = {
    indexed: new Set(),
    unique: new Set(),
    immutable: immutable.names,
    immutableWhen: immutable.when,
    transient: stringList(schema.transient),
    entryPayload: stringList(schema.entryPayload),
    moderatorOnly: stringList(abilities.changeFields),
  };
  // An index property `<reference>.<field>` reads the field of the document
  // the top-level reference points at (derived index properties).
  for (const idx of indices) {
    const derived = idx.fields
      .map((f) => f.field)
      .filter((path) => {
        const dot = path.indexOf('.');
        return dot > 0 && isObj(properties[path.slice(0, dot)]?.refersTo);
      });
    if (derived.length) idx.derived = derived;
  }
  const terminals = new Set<string>();
  for (const idx of indices) {
    for (const f of idx.fields) {
      marks.indexed.add(f.field);
      if (idx.unique) marks.unique.add(f.field);
    }
    const terminal = idx.options.terminal;
    for (const t of Array.isArray(terminal) ? terminal : [terminal]) if (typeof t === 'string') terminals.add(t);
  }

  const typeReferences: Reference[] = [];
  const owner = schema.ownerRefersTo !== undefined ? makeReference('$ownerId', 'owner', schema.ownerRefersTo) : undefined;
  if (owner) typeReferences.push(owner);
  const creator =
    schema.creatorRefersTo !== undefined ? makeReference('$creatorId', 'creator', schema.creatorRefersTo) : undefined;
  if (creator) typeReferences.push(creator);

  const fields: Field[] = [];
  pushProperties(fields, properties, required, '', 0, marks, defs);

  // System ($-prefixed) fields a keyword names but the schema does not declare:
  // surface them so indexes resolve, recorded times show and type references
  // have a row to start from.
  const systemNames = new Set<string>();
  for (const n of required) if (n.startsWith('$')) systemNames.add(n);
  for (const f of marks.indexed) if (f.startsWith('$')) systemNames.add(f);
  for (const t of terminals) if (t.startsWith('$')) systemNames.add(t);
  for (const r of typeReferences) systemNames.add(r.path);
  const present = new Set(fields.map((f) => f.path));
  const order = (n: string) => (SYSTEM_ORDER.includes(n) ? SYSTEM_ORDER.indexOf(n) : SYSTEM_ORDER.length);
  for (const n of [...systemNames].filter((n) => !present.has(n)).sort((a, b) => order(a) - order(b))) {
    fields.push({
      name: n,
      path: n,
      depth: 0,
      type: SYSTEM_FIELD_TYPE[n] ?? 'system',
      required: required.has(n) || n === '$ownerId' || n === '$creatorId',
      system: true,
      indexed: marks.indexed.has(n),
      unique: marks.unique.has(n),
      constraints: {},
      reference: typeReferences.find((r) => r.path === n),
      written: {},
    });
  }

  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) if (!STRUCTURAL_KEYS.has(k)) config[k] = v;

  return {
    name,
    fields,
    indices,
    config,
    typeReferences,
    propertyConstraints: isObj(schema.propertyConstraints) ? { ...schema.propertyConstraints } : {},
    description: typeof schema.description === 'string' ? schema.description : undefined,
    schema,
  };
}

export interface ContractMeta {
  contractId?: string;
  ownerId?: string;
  version?: number;
  config?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  keywords?: string[];
  description?: string;
  times?: Record<string, number>;
  schemaDefs?: Record<string, unknown>;
}

export function toContractModel(schemas: Record<string, Schema>, meta: ContractMeta = {}): ContractModel {
  const entities = Object.entries(schemas).map(([name, schema]) => buildEntity(name, schema, meta.schemaDefs));
  return { ...meta, entities, externals: [], relationships: [] };
}

const TIME_KEYS = [
  'createdAt',
  'updatedAt',
  'createdAtBlockHeight',
  'updatedAtBlockHeight',
  'createdAtEpoch',
  'updatedAtEpoch',
];

const asRecord = (v: unknown) => (isObj(v) ? v : undefined);
const nonEmpty = (v: Record<string, unknown> | undefined) => (v && Object.keys(v).length > 0 ? v : undefined);

/** Contract-level metadata from a contract's JSON form (fetched, pasted or bundled). */
export function metaFromContractJson(obj: Record<string, unknown>): ContractMeta {
  const times: Record<string, number> = {};
  for (const k of TIME_KEYS) if (typeof obj[k] === 'number') times[k] = obj[k] as number;
  const keywords = Array.isArray(obj.keywords) ? obj.keywords.filter((k): k is string => typeof k === 'string') : [];
  return {
    contractId: typeof obj.id === 'string' ? obj.id : undefined,
    ownerId: typeof obj.ownerId === 'string' ? obj.ownerId : undefined,
    version: typeof obj.version === 'number' ? obj.version : undefined,
    config: asRecord(obj.config),
    groups: nonEmpty(asRecord(obj.groups)),
    tokens: nonEmpty(asRecord(obj.tokens)),
    keywords: keywords.length ? keywords : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    times: Object.keys(times).length ? times : undefined,
    schemaDefs: nonEmpty(asRecord(obj.schemaDefs ?? obj.$defs)),
  };
}

/**
 * Accept a pasted blob that is either a full contract
 * (`{ documentSchemas | schemas: {...} }`, optionally with id/ownerId/version,
 * config, schemaDefs, keywords, description)
 * or a bare document-schemas map (`{ docType: {properties, indices, ...} }`).
 */
export function modelFromPastedJson(input: unknown): ContractModel {
  if (input == null || typeof input !== 'object') {
    throw new Error('Pasted value is not a JSON object.');
  }
  const obj = input as Record<string, unknown>;
  const wrapped = (obj.documentSchemas ?? obj.schemas ?? obj.documents) as Record<string, Schema> | undefined;
  if (wrapped && typeof wrapped === 'object') {
    return toContractModel(wrapped, metaFromContractJson(obj));
  }
  // Heuristic: treat top-level entries that look like document schemas as the map.
  const looksLikeSchemas = Object.values(obj).every(
    (v) => v && typeof v === 'object' && ('properties' in (v as object) || 'indices' in (v as object)),
  );
  if (looksLikeSchemas && Object.keys(obj).length > 0) {
    return toContractModel(obj as Record<string, Schema>);
  }
  throw new Error(
    'Could not find document schemas. Paste a contract with a "documentSchemas" block, or a bare { docType: { properties, indices } } map.',
  );
}
