// What a contract update may change, per the "On update" rule of each keyword
// in The Dash Platform Book (contract-keywords chapters). Each finding names
// the consensus error the platform returns and links the rule.
//
// This mirrors the book, not the validator: the exact verdict is
// DataContract::validate_update in rs-dpp. Where the book makes the outcome
// depend on something the schema text alone does not settle (how an integer
// is stored, whether a changed definition stays compatible) the finding is a
// 'check', not a 'refused'.

import { BOOK } from './describe';
import { immutableEntries } from './introspect';

export interface Refusal {
  severity: 'refused' | 'check';
  code: number;
  error: string;
  /** The rule, in the book's words (shortened). */
  rule: string;
  href: string;
}

const kw = (page: string, anchor?: string) => `${BOOK}contract-keywords/${page}.html${anchor ? `#${anchor}` : ''}`;

const E = {
  schema: { code: 10246, error: 'IncompatibleDocumentTypeSchemaError' },
  typeUpdate: { code: 40212, error: 'DocumentTypeUpdateError' },
  required: { code: 10276, error: 'DataContractInvalidRequiredFieldsUpdateError' },
  index: { code: 10217, error: 'DataContractInvalidIndexDefinitionUpdateError' },
  config: { code: 40002, error: 'DataContractConfigUpdateError' },
  readonly: { code: 40001, error: 'DataContractIsReadonlyError' },
  permission: { code: 40003, error: 'DataContractUpdatePermissionError' },
  notAllowed: { code: 40004, error: 'DataContractUpdateActionNotAllowedError' },
  version: { code: 10212, error: 'InvalidDataContractVersionError' },
  defs: { code: 10213, error: 'IncompatibleDataContractSchemaError' },
} as const;

const refuse = (e: { code: number; error: string }, rule: string, href: string): Refusal => ({ severity: 'refused', ...e, rule, href });
const check = (e: { code: number; error: string }, rule: string, href: string): Refusal => ({ severity: 'check', ...e, rule, href });

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Structural equality of JSON values; object key order does not matter. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && sameJson(a[k], b[k]));
  }
  return false;
}

const asSet = (v: unknown) => new Set(Array.isArray(v) ? v.map((x) => JSON.stringify(x)) : []);
const sameSet = (a: unknown, b: unknown) => {
  const sa = asSet(a);
  const sb = asSet(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);

// ---------------------------------------------------------------- contract

export interface ContractSide {
  ownerId?: string;
  version?: number;
  config?: Record<string, unknown>;
}

/** Contract-level refusals. `changed`: the rest of the contract differs (an unchanged contract is no update). */
export function contractRefusals(base: ContractSide, head: ContractSide, changed: boolean): Refusal[] {
  const out: Refusal[] = [];
  const cfg = kw('contract-config');
  if (base.ownerId && head.ownerId && base.ownerId !== head.ownerId) {
    out.push(refuse(E.permission, 'Only the owner may update a contract; the owner never changes.', `${cfg}#contract-keys`));
  }
  const versionMoved = base.version !== head.version;
  if ((changed || versionMoved) && base.version !== undefined && head.version !== undefined && head.version !== base.version + 1) {
    out.push(refuse(E.version, `Every update raises the version by exactly one: ${base.version} must become ${base.version + 1}, not ${head.version}.`, `${cfg}#contract-keys`));
  }
  if (changed && base.config?.readonly === true) {
    out.push(refuse(E.readonly, 'A readonly contract can never be updated.', `${cfg}#readonly`));
  }
  return out;
}

/** One config key's change. `undefined` means the key is absent. */
export function configKeyRefusal(key: string, before: unknown, after: unknown): Refusal | undefined {
  const cfg = kw('contract-config');
  switch (key) {
    case '$formatVersion':
      return undefined;
    case 'readonly':
      return after === true && before !== true ? refuse(E.config, 'readonly cannot be set by an update.', `${cfg}#readonly`) : undefined;
    case 'sizedIntegerTypes':
      return before !== false && after === false ? refuse(E.config, 'sizedIntegerTypes may be turned on, not off.', `${cfg}#sizedintegertypes`) : undefined;
    case 'moderation':
      return moderationRefusal(before, after);
    case 'canBeDeleted':
    case 'keepsHistory':
    case 'documentsKeepHistoryContractDefault':
    case 'documentsMutableContractDefault':
    case 'documentsCanBeDeletedContractDefault':
    case 'requiresIdentityEncryptionBoundedKey':
    case 'requiresIdentityDecryptionBoundedKey':
      // A bounded key requirement serializes as null when unset.
      if ((before ?? null) === (after ?? null)) return undefined;
      return refuse(E.config, `config.${key} is fixed at registration.`, `${cfg}#config`);
    default:
      return undefined;
  }
}

function moderationRefusal(before: unknown, after: unknown): Refusal | undefined {
  const href = `${kw('contract-config')}#moderation`;
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  for (const list of ['banlist', 'suspensions', 'warnings']) {
    if ((b[list] === true) !== (a[list] === true)) return refuse(E.config, 'Which moderation lists a contract keeps is fixed.', href);
  }
  const bm = isObj(b.moderators) ? b.moderators : undefined;
  const am = isObj(a.moderators) ? a.moderators : undefined;
  const wasElected = bm?.$type === 'elected';
  const isElected = am?.$type === 'elected';
  if (wasElected || isElected) {
    if (!wasElected) return refuse(E.config, 'An elected team cannot be declared by an update.', href);
    if (!isElected) return refuse(E.config, 'An elected team cannot be left by an update.', href);
    if (!sameJson(bm, am)) return refuse(E.config, 'An elected declaration is fixed when the contract is created.', href);
  }
  return undefined;
}

export function schemaDefRefusal(before: unknown, after: unknown): Refusal | undefined {
  const href = `${kw('document-shape')}#schema-and-defs`;
  if (before !== undefined && after === undefined) return refuse(E.defs, 'A definition in schemaDefs may not be removed.', href);
  if (before !== undefined && !sameJson(before, after)) {
    return check(E.defs, 'A changed definition must stay compatible with the old one; the platform compares them.', href);
  }
  return undefined;
}

export function tokenOrGroupRefusal(what: 'token' | 'group', before: unknown, after: unknown): Refusal | undefined {
  const href = `${BOOK}data-model/data-contracts.html#what-v1-added`;
  if (before !== undefined && after === undefined) return refuse(E.notAllowed, `A ${what} may not be removed by an update.`, href);
  if (before !== undefined && !sameJson(before, after)) return refuse(E.notAllowed, `An existing ${what} may not be changed by an update.`, href);
  return undefined;
}

// ----------------------------------------------------------- document type

export function removedTypeRefusal(): Refusal {
  return refuse(E.typeUpdate, 'Document types may be added; none may be removed.', `${kw('contract-config')}#documentschemas`);
}

/** Keys fixed as a document-type setting (40212); adding or removing one with its value unchanged is a schema change (10246). */
const FIXED_WITH_PRESENCE: Record<string, string> = {
  documentsMutable: kw('mutability', 'documentsmutable'),
  creationRestrictionMode: kw('ownership-and-trading', 'creationrestrictionmode'),
  transferable: kw('ownership-and-trading', 'transferable'),
  tradeMode: kw('ownership-and-trading', 'trademode'),
  documentsKeepHistory: kw('history', 'documentskeephistory'),
  signatureSecurityLevelRequirement: kw('signing-keys', 'signaturesecuritylevelrequirement'),
  canBeDeleted: kw('deletion', 'canbedeleted'),
};

/** Keys any change of which is refused as a document type update (40212). */
const FIXED_TYPE: Record<string, string> = {
  moderatorAbilities: kw('moderator-abilities'),
  ttl: kw('ttl'),
  keepsTransferHistory: kw('history', 'keepstransferhistory'),
  keepsPurchaseHistory: kw('history', 'keepspurchasehistory'),
  keepsPricingHistory: kw('history', 'keepspricinghistory'),
  requiresIdentityEncryptionBoundedKey: kw('signing-keys', 'requiresidentityencryptionboundedkey'),
  requiresIdentityDecryptionBoundedKey: kw('signing-keys', 'requiresidentitydecryptionboundedkey'),
  indexOnly: kw('index-only', 'indexonly'),
  documentsCountable: kw('aggregates', 'documentscountable'),
  documentsSummable: kw('aggregates', 'documentssummable'),
  documentsAverageable: kw('aggregates', 'documentsaverageable'),
  rangeCountable: kw('aggregates'),
  rangeSummable: kw('aggregates'),
  rangeAverageable: kw('aggregates'),
  actionFees: kw('action-fees'),
  tokenCost: kw('token-cost'),
};

/** Keys any change of which is refused as a schema change (10246). */
const FIXED_SCHEMA: Record<string, string> = {
  ownerRefersTo: kw('owner-refers-to', 'ownerrefersto'),
  creatorRefersTo: kw('owner-refers-to', 'creatorrefersto'),
  additionalProperties: kw('document-shape', 'additionalproperties'),
  minProperties: kw('document-shape', 'minproperties-and-maxproperties'),
  maxProperties: kw('document-shape', 'minproperties-and-maxproperties'),
  type: kw('document-shape', 'type'),
};

const FREE_KEYS = new Set(['description', '$comment']);

export interface TypeContext {
  base: Record<string, unknown>;
  head: Record<string, unknown>;
}

/**
 * One document type key's change on an existing type. `required`, `indices`,
 * `properties` and `propertyConstraints` are judged elsewhere.
 */
export function typeKeyRefusal(key: string, before: unknown, after: unknown, ctx: TypeContext): Refusal | undefined {
  if (FREE_KEYS.has(key)) return undefined;
  if (key in FIXED_WITH_PRESENCE) {
    const href = FIXED_WITH_PRESENCE[key];
    if (before === undefined || after === undefined) {
      return refuse(E.schema, `Adding or removing ${key}, even with the value it already had, is a schema change.`, href);
    }
    if (key === 'canBeDeleted' && before === true && after === false && ctx.base.documentsKeepHistory === true && ctx.head.documentsKeepHistory === true) {
      return undefined; // allowed on a type that keeps history before and after
    }
    return refuse(E.typeUpdate, `${key} is fixed.`, href);
  }
  if (key in FIXED_TYPE) return refuse(E.typeUpdate, `${key} may not be added, changed or removed on an existing type.`, FIXED_TYPE[key]);
  if (key in FIXED_SCHEMA) return refuse(E.schema, `${key} may not be added, changed or removed.`, FIXED_SCHEMA[key]);
  switch (key) {
    case 'entryPayload':
      return sameSet(before, after) ? undefined : refuse(E.typeUpdate, 'entryPayload is fixed (read as a set).', kw('index-only', 'entrypayload'));
    case 'transient':
      return sameSet(before, after) ? undefined : refuse(E.schema, 'transient is fixed (compared as a set).', kw('transient'));
    case 'immutable': {
      // May only tighten: entries may be added, a condition may be dropped
      // (freezing the property outright), nothing else.
      const b = immutableEntries(before);
      const a = immutableEntries(after);
      const href = kw('mutability', 'on-update');
      const lost = [...b.names].filter((p) => !a.names.has(p));
      if (lost.length) return refuse(E.typeUpdate, `immutable may gain entries, never lose one (lost ${lost.join(', ')}).`, href);
      for (const p of b.names) {
        if (!b.when.has(p) && a.when.has(p)) return refuse(E.typeUpdate, `${p} is frozen outright; it may not gain a condition.`, href);
        if (b.when.has(p) && a.when.has(p) && !sameJson(b.when.get(p), a.when.get(p))) {
          return refuse(E.typeUpdate, `The condition freezing ${p} may be dropped, never changed.`, href);
        }
      }
      return undefined;
    }
    case 'dependentRequired':
      return dependentRequiredRefusal(before, after, kw('document-shape', 'dependentrequired'));
    default:
      return undefined;
  }
}

function dependentRequiredRefusal(before: unknown, after: unknown, href: string): Refusal | undefined {
  if (after === undefined) return undefined; // the whole keyword may go
  const b = isObj(before) ? before : {};
  const a = isObj(after) ? after : {};
  for (const [k, names] of Object.entries(a)) {
    const old = b[k];
    if (old === undefined) return refuse(E.schema, `dependentRequired may lose entries, not gain them (new entry ${k}).`, href);
    const oldSet = asSet(old);
    if ([...asSet(names)].some((n) => !oldSet.has(n))) return refuse(E.schema, `dependentRequired may lose names, not gain them (entry ${k}).`, href);
  }
  return undefined;
}

/** `required` of an existing type: may gain only a property the same update adds with requiredSince; may lose nothing. */
export function requiredRefusals(
  before: string[],
  after: string[],
  addedWithRequiredSince: Set<string>,
): Array<{ name: string; refusal: Refusal }> {
  const href = kw('document-shape', 'required');
  const out: Array<{ name: string; refusal: Refusal }> = [];
  for (const n of before) {
    if (!after.includes(n)) out.push({ name: n, refusal: refuse(E.required, `required may lose nothing (${n} was dropped).`, href) });
  }
  for (const n of after) {
    if (before.includes(n)) continue;
    if (n.startsWith('$')) {
      out.push({ name: n, refusal: refuse(E.required, `The recorded times and heights are fixed: ${n} may not be added to required.`, kw('system-properties', 'timestamps')) });
    } else if (!addedWithRequiredSince.has(n)) {
      out.push({
        name: n,
        refusal: refuse(E.required, `required may gain only a property the same update adds, annotated with requiredSince (${n}).`, kw('required-since')),
      });
    }
  }
  return out;
}

/** requiredSince on a property an update adds (to an existing or a new type) must equal the version the update creates. */
export function addedRequiredSinceRefusal(requiredSince: unknown, headVersion: number | undefined): Refusal | undefined {
  if (requiredSince === undefined || headVersion === undefined || requiredSince === headVersion) return undefined;
  return refuse(E.required, `requiredSince on an added property must equal the contract version the update creates (${headVersion}), not ${String(requiredSince)}.`, kw('required-since'));
}

export function removedPropertyRefusal(): Refusal {
  return refuse(E.schema, 'Properties may be added, never removed.', kw('document-shape', 'properties'));
}

export function indexRefusal(kind: 'added' | 'removed' | 'changed'): Refusal {
  const what = kind === 'changed' ? 'changed' : kind;
  return refuse(E.index, `An index of an existing document type may not be added, removed or changed (this one is ${what}); Drive never backfills or cleans index trees.`, kw('indexes', 'indices'));
}

export function constraintRefusal(): Refusal {
  return refuse(E.schema, 'A propertyConstraints rule may not be added, removed or changed on an existing type.', kw('property-constraints'));
}

// ---------------------------------------------------------------- property

export interface PropertyContext {
  /** The property's written schema before and after (for byte-array and typed-array rules). */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  /** Judging a key inside `items` (the element of a typed array). */
  element?: boolean;
}

const isByteArray = (p: Record<string, unknown>) => p.type === 'array' && p.byteArray === true;
const isTypedArray = (p: Record<string, unknown>) => p.type === 'array' && isObj(p.items);

const ps = (anchor: string) => kw('property-schemas', anchor);

/** Upper bounds: may be raised or removed, never added or lowered. */
function upper(key: string, before: unknown, after: unknown, href: string, e: { code: number; error: string } = E.schema) {
  if (after === undefined) return undefined;
  if (before === undefined) return refuse(e, `${key} may not be added.`, href);
  const b = num(before);
  const a = num(after);
  if (b !== undefined && a !== undefined && a < b) return refuse(e, `${key} may be raised or removed, not lowered (${b} → ${a}).`, href);
  return undefined;
}

/** Lower bounds: may be lowered or removed, never added or raised. */
function lower(key: string, before: unknown, after: unknown, href: string, e: { code: number; error: string } = E.schema) {
  if (after === undefined) return undefined;
  if (before === undefined) return refuse(e, `${key} may not be added.`, href);
  const b = num(before);
  const a = num(after);
  if (b !== undefined && a !== undefined && a > b) return refuse(e, `${key} may be lowered or removed, not raised (${b} → ${a}).`, href);
  return undefined;
}

/** One property key's change on a property that exists before and after. */
export function propertyKeyRefusal(key: string, before: unknown, after: unknown, ctx: PropertyContext): Refusal | undefined {
  switch (key) {
    case 'description':
    case '$comment':
    case 'examples':
      return undefined;
    case '$id':
      return before === undefined ? undefined : refuse(E.schema, '$id may be added, not removed or changed.', ps('annotations'));
    case 'type':
      return refuse(ctx.element ? E.typeUpdate : E.schema, ctx.element ? 'A change to how a typed array element is stored is refused.' : 'A property type is fixed.', ctx.element ? kw('typed-arrays') : ps('type'));
    case 'position':
      return refuse(E.schema, 'position is fixed.', ps('position'));
    case '$ref':
      return refuse(E.schema, '$ref is fixed.', ps('ref'));
    case 'byteArray':
    case 'contentMediaType':
      return refuse(E.schema, 'Whether an array is a byte array or an identifier is fixed.', ps('byte-arrays-and-identifiers'));
    case 'refersTo':
      return refuse(E.schema, 'Adding, removing or changing any part of a refersTo declaration is refused.', kw('refers-to'));
    case 'distinctFrom':
      return refuse(E.schema, 'distinctFrom may not be added, removed or changed.', kw('distinct-from'));
    case 'encryptedFor':
      return refuse(E.schema, 'encryptedFor may not be added, removed or changed: documents already written could not be read under another recipe.', kw('encrypted-for'));
    case 'requiredSince':
      return refuse(E.schema, 'An existing requiredSince annotation may not be added, changed or removed.', kw('required-since'));
    case 'items':
      return before === undefined || after === undefined ? refuse(E.schema, 'items may be neither added nor removed.', kw('typed-arrays')) : undefined;
    case 'maxLength':
      return upper('maxLength', before, after, ps('strings'));
    case 'minLength':
      return lower('minLength', before, after, ps('strings'));
    case 'maxBytes':
      return upper('maxBytes', before, after, kw('max-bytes'));
    case 'pattern':
    case 'format':
      return after === undefined ? undefined : refuse(E.schema, `${key} may be removed, not added or changed.`, ps('strings'));
    case 'maximum':
    case 'exclusiveMaximum':
    case 'minimum':
    case 'exclusiveMinimum': {
      const r = key === 'maximum' || key === 'exclusiveMaximum' ? upper(key, before, after, ps('numbers')) : lower(key, before, after, ps('numbers'));
      if (r) return r;
      return ctx.after.type === 'integer'
        ? check(E.typeUpdate, `Allowed unless it changes how the integer is stored (its width follows its bounds).`, ps('numbers'))
        : undefined;
    }
    case 'multipleOf':
      return refuse(E.schema, 'multipleOf is fixed.', ps('numbers'));
    case 'enum': {
      if (after === undefined) return undefined;
      if (before === undefined) return refuse(E.schema, 'enum may be removed, not added.', ps('enum-and-const'));
      const kept = asSet(after);
      const lost = [...asSet(before)].filter((v) => !kept.has(v));
      if (lost.length) return refuse(E.schema, `enum may gain values but not lose one (lost ${lost.join(', ')}).`, ps('enum-and-const'));
      return ctx.after.type === 'integer' ? check(E.typeUpdate, 'Allowed unless a new value changes how the integer is stored.', ps('enum-and-const')) : undefined;
    }
    case 'const':
      return after === undefined ? undefined : refuse(E.schema, 'const may be removed, not added or changed.', ps('enum-and-const'));
    case 'maxItems':
    case 'minItems': {
      if (isTypedArray(ctx.before) && key === 'maxItems') return refuse(E.schema, 'A typed array keeps its maxItems.', ps('arrays'));
      if (isByteArray(ctx.before) || isByteArray(ctx.after)) {
        const fixedBefore = ctx.before.minItems !== undefined && ctx.before.minItems === ctx.before.maxItems;
        const fixedAfter = ctx.after.minItems !== undefined && ctx.after.minItems === ctx.after.maxItems;
        if (fixedBefore || fixedAfter) {
          return refuse(E.typeUpdate, 'A byte array may not switch between a fixed and a variable length, or change its fixed length.', ps('byte-arrays-and-identifiers'));
        }
      }
      return key === 'maxItems' ? upper('maxItems', before, after, ps('arrays')) : lower('minItems', before, after, ps('arrays'));
    }
    case 'uniqueItems':
      return after === undefined || after === false ? undefined : refuse(E.schema, 'uniqueItems may be removed or set to false, not added.', ps('arrays'));
    case 'contains':
      return refuse(E.schema, 'contains is fixed.', ps('arrays'));
    case 'required':
    case 'additionalProperties':
    case 'minProperties':
    case 'maxProperties':
      return refuse(E.schema, `An object's ${key} is fixed.`, ps('objects'));
    case 'dependentRequired':
      return dependentRequiredRefusal(before, after, ps('objects'));
    default:
      return undefined;
  }
}
