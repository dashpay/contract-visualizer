// Turn a contract's document schemas into a ContractModel.
//
// Input is the parsed `contract.schemas` record (docTypeName -> JSON schema),
// or a pasted equivalent. We never need a platform version — the schema object
// already holds properties, indices and required.

import type { Entity, Field, Index, IndexField } from './types';
import type { ContractModel } from './types';

type Schema = Record<string, unknown>;
type Props = Record<string, Record<string, unknown>>;

const SYSTEM_FIELD_TYPE: Record<string, string> = {
  $id: 'identifier',
  $ownerId: 'identifier',
  $createdAt: 'timestamp',
  $updatedAt: 'timestamp',
  $transferredAt: 'timestamp',
  $revision: 'integer',
};
// Stable display order for system fields appended after user properties.
const SYSTEM_ORDER = ['$id', '$ownerId', '$revision', '$createdAt', '$updatedAt', '$transferredAt'];

const CONFIG_KEYS = [
  'documentsMutable',
  'canBeDeleted',
  'transferable',
  'tradeMode',
  'creationRestrictionMode',
  'documentsKeepHistory',
  'requiresIdentityEncryptionBoundedKey',
  'requiresIdentityDecryptionBoundedKey',
];

const CONSTRAINT_KEYS = [
  'maxLength',
  'minLength',
  'enum',
  'format',
  'pattern',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'contentMediaType',
];

/** Best-effort display type for a JSON-schema property. */
function displayType(prop: Record<string, unknown>): string {
  const t = prop.type;
  if (t === 'array') {
    if (prop.byteArray === true) {
      const media = typeof prop.contentMediaType === 'string' ? prop.contentMediaType : '';
      return media.includes('identifier') ? 'identifier' : 'bytes';
    }
    const items = prop.items as Record<string, unknown> | undefined;
    const itemType = items && typeof items.type === 'string' ? items.type : 'any';
    return `array<${itemType}>`;
  }
  return typeof t === 'string' ? t : 'object';
}

export function isIdentifierProp(prop: Record<string, unknown> | undefined): boolean {
  if (!prop) return false;
  if (prop.type !== 'array' || prop.byteArray !== true) return false;
  const media = typeof prop.contentMediaType === 'string' ? prop.contentMediaType : '';
  return media.includes('identifier');
}

function pickConstraints(prop: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CONSTRAINT_KEYS) {
    if (prop[k] !== undefined) out[k] = prop[k];
  }
  return out;
}

function parseIndices(schema: Schema): Index[] {
  const raw = Array.isArray(schema.indices) ? (schema.indices as Array<Record<string, unknown>>) : [];
  return raw.map((idx) => {
    const propsArr = Array.isArray(idx.properties) ? (idx.properties as Array<Record<string, string>>) : [];
    const fields: IndexField[] = propsArr.map((entry) => {
      const [field, dir] = Object.entries(entry)[0] ?? ['?', 'asc'];
      return { field, direction: dir === 'desc' ? 'desc' : 'asc' };
    });
    return {
      name: typeof idx.name === 'string' ? idx.name : fields.map((f) => f.field).join('+'),
      fields,
      unique: idx.unique === true,
    };
  });
}

function buildEntity(name: string, schema: Schema): Entity {
  const properties: Props = (schema.properties as Props) ?? {};
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const indices = parseIndices(schema);

  const indexedFields = new Set<string>();
  const uniqueFields = new Set<string>();
  for (const idx of indices) {
    for (const f of idx.fields) {
      indexedFields.add(f.field);
      if (idx.unique) uniqueFields.add(f.field);
    }
  }

  const fields: Field[] = [];
  // User-defined properties first, in declared `position` order.
  const propNames = Object.keys(properties).sort((a, b) => {
    const pa = Number(properties[a]?.position ?? 1e9);
    const pb = Number(properties[b]?.position ?? 1e9);
    return pa - pb;
  });
  for (const propName of propNames) {
    const prop = properties[propName];
    fields.push({
      name: propName,
      type: displayType(prop),
      required: required.has(propName),
      system: false,
      position: typeof prop.position === 'number' ? prop.position : undefined,
      indexed: indexedFields.has(propName),
      unique: uniqueFields.has(propName),
      constraints: pickConstraints(prop),
      description: typeof prop.description === 'string' ? prop.description : undefined,
    });
  }

  // System ($-prefixed) fields referenced by required or by an index but not
  // declared as properties — surface them so indexes resolve and timestamps show.
  const present = new Set(fields.map((f) => f.name));
  const systemNames = new Set<string>();
  for (const n of required) if (n.startsWith('$')) systemNames.add(n);
  for (const f of indexedFields) if (f.startsWith('$')) systemNames.add(f);
  for (const n of [...systemNames].filter((n) => !present.has(n)).sort(
    (a, b) => SYSTEM_ORDER.indexOf(a) - SYSTEM_ORDER.indexOf(b),
  )) {
    fields.push({
      name: n,
      type: SYSTEM_FIELD_TYPE[n] ?? 'system',
      required: required.has(n),
      system: true,
      indexed: indexedFields.has(n),
      unique: uniqueFields.has(n),
      constraints: {},
    });
  }

  const config: Record<string, unknown> = {};
  for (const k of CONFIG_KEYS) if (schema[k] !== undefined) config[k] = schema[k];

  return { name, fields, indices, config };
}

export interface ContractMeta {
  contractId?: string;
  ownerId?: string;
  version?: number;
  config?: Record<string, unknown>;
  groups?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
}

export function toContractModel(schemas: Record<string, Schema>, meta: ContractMeta = {}): ContractModel {
  const entities = Object.entries(schemas).map(([name, schema]) => buildEntity(name, schema));
  return { ...meta, entities, relationships: [] };
}

/**
 * Accept a pasted blob that is either a full contract
 * (`{ documentSchemas | schemas: {...} }`, optionally with id/ownerId/version)
 * or a bare document-schemas map (`{ docType: {properties, indices, ...} }`).
 */
export function modelFromPastedJson(input: unknown): ContractModel {
  if (input == null || typeof input !== 'object') {
    throw new Error('Pasted value is not a JSON object.');
  }
  const obj = input as Record<string, unknown>;
  const wrapped = (obj.documentSchemas ?? obj.schemas ?? obj.documents) as
    | Record<string, Schema>
    | undefined;
  if (wrapped && typeof wrapped === 'object') {
    const asRecord = (v: unknown) =>
      v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
    return toContractModel(wrapped, {
      contractId: typeof obj.id === 'string' ? obj.id : undefined,
      ownerId: typeof obj.ownerId === 'string' ? obj.ownerId : undefined,
      version: typeof obj.version === 'number' ? obj.version : undefined,
      config: asRecord(obj.config),
      groups: asRecord(obj.groups),
      tokens: asRecord(obj.tokens),
    });
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
