// Plain-language descriptions of contract keywords: short chips for the
// canvas and a sentence plus a book link for the inspector. Pure functions of
// the model, so the canvas, inspector and metadata panel say the same thing.

import type { Entity, Field, Index, RefTarget } from './types';

export const BOOK = 'https://dashpay.github.io/platform/';
const kw = (page: string, anchor?: string) => `${BOOK}contract-keywords/${page}.html${anchor ? `#${anchor}` : ''}`;

export type Tone = 'lifecycle' | 'access' | 'money' | 'aggregate' | 'storage' | 'reference' | 'neutral';

export interface Chip {
  /** Short text on the canvas. */
  text: string;
  /** One sentence for tooltips and the inspector. */
  detail: string;
  tone: Tone;
  href?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 3600 -> "1h", 2592000 -> "30d", 90 -> "90s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return String(seconds);
  const units: Array<[number, string]> = [
    [31536000, 'y'],
    [604800, 'w'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [size, unit] of units) {
    if (seconds >= size && seconds % size === 0) return `${seconds / size}${unit}`;
  }
  if (seconds >= 86400) return `${Math.round((seconds / 86400) * 10) / 10}d`;
  return `${seconds}s`;
}

/** Credits with a DASH equivalent (1 DASH = 10^11 credits). */
export function formatCredits(credits: number): string {
  const dash = credits / 1e11;
  const dashText = dash >= 0.0001 ? `${dash.toLocaleString(undefined, { maximumSignificantDigits: 4 })} DASH` : `${dash.toExponential(1)} DASH`;
  return `${credits.toLocaleString()} credits (${dashText})`;
}

const SECURITY_LEVEL: Record<string, string> = { '0': 'master', '1': 'critical', '2': 'high', '3': 'medium' };
const BOUNDED_KEY: Record<string, string> = { '0': 'one key', '1': 'several keys', '2': 'several keys, latest pointed at' };
const ACTIONS = ['create', 'replace', 'delete', 'transfer', 'update_price', 'purchase'];

function feeLines(fees: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const action of ACTIONS) {
    const f = fees[action];
    if (!isObj(f)) continue;
    const pots = Object.entries(f)
      .filter(([, v]) => typeof v === 'number')
      .map(([pot, v]) => `${pot} ${formatCredits(v as number)}`);
    if (pots.length) parts.push(`${action}: ${pots.join(', ')}`);
  }
  return parts.join('; ');
}

function tokenCostLines(costs: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const action of ACTIONS) {
    const c = costs[action];
    if (!isObj(c)) continue;
    const bits = [`${c.amount ?? '?'} of token #${c.tokenPosition ?? 0}`];
    if (typeof c.contractId === 'string') bits.push(`of contract ${c.contractId}`);
    if (c.effect === 1) bits.push('burned');
    if (c.optional === true) bits.push('optional');
    if (c.gasFeesPaidBy === 1) bits.push('gas paid by the contract owner');
    if (c.gasFeesPaidBy === 2) bits.push('gas preferably paid by the contract owner');
    parts.push(`${action}: ${bits.join(', ')}`);
  }
  return parts.join('; ');
}

/** Document type keywords, as chips. Defaults that say nothing are left out. */
export function documentTypeChips(entity: Entity): Chip[] {
  const c = entity.config;
  const out: Chip[] = [];
  if (c.indexOnly === true) {
    out.push({ text: 'index-only', detail: 'Documents are never stored whole: the index entries are the rows.', tone: 'storage', href: kw('index-only', 'indexonly') });
  }
  if (typeof c.ttl === 'number') {
    out.push({ text: `ttl ${formatDuration(c.ttl)}`, detail: `The platform deletes each document ${formatDuration(c.ttl)} (${c.ttl.toLocaleString()} s) after its creation.`, tone: 'lifecycle', href: kw('ttl') });
  }
  if (c.documentsMutable === false) {
    out.push({ text: 'no edits', detail: 'documentsMutable: false. A document cannot be replaced once created.', tone: 'lifecycle', href: kw('mutability', 'documentsmutable') });
  }
  if (c.canBeDeleted === false) {
    out.push({ text: 'no delete', detail: 'canBeDeleted: false. The owner cannot delete a document.', tone: 'lifecycle', href: kw('deletion', 'canbedeleted') });
  }
  if (c.canBeDeletedByModerators === true) {
    const window = typeof c.canBeDeletedByModeratorsFor === 'number' ? c.canBeDeletedByModeratorsFor : undefined;
    out.push({
      text: window ? `mods delete ≤${formatDuration(window)}` : 'mods delete',
      detail: window
        ? `The contract's moderators may delete a document up to ${formatDuration(window)} after its last change.`
        : "The contract's moderators may delete documents of this type.",
      tone: 'access',
      href: kw('deletion', 'canbedeletedbymoderators'),
    });
  }
  if (c.creationRestrictionMode === 1) {
    out.push({ text: 'owner creates', detail: 'creationRestrictionMode 1: only the contract owner may create documents.', tone: 'access', href: kw('ownership-and-trading', 'creationrestrictionmode') });
  } else if (c.creationRestrictionMode === 2) {
    out.push({ text: 'no creates', detail: 'creationRestrictionMode 2: nobody may create documents (system-created only).', tone: 'access', href: kw('ownership-and-trading', 'creationrestrictionmode') });
  }
  if (c.transferable === 1) {
    out.push({ text: 'transferable', detail: 'An owner may give a document to another identity.', tone: 'access', href: kw('ownership-and-trading', 'transferable') });
  }
  if (c.tradeMode === 1) {
    out.push({ text: 'for sale', detail: 'tradeMode 1: an owner may set a price and anyone may buy at it.', tone: 'money', href: kw('ownership-and-trading', 'trademode') });
  }
  if (c.documentsKeepHistory === true) {
    out.push({ text: 'history', detail: 'Drive keeps every revision of every document.', tone: 'storage', href: kw('history', 'documentskeephistory') });
  }
  const logs = [
    c.keepsTransferHistory === true && 'transfers',
    c.keepsPurchaseHistory === true && 'purchases',
    c.keepsPricingHistory === true && 'price changes',
  ].filter(Boolean) as string[];
  if (logs.length) {
    out.push({ text: 'logged', detail: `Records ${logs.join(', ')} in the document history contract.`, tone: 'storage', href: kw('history', 'keepstransferhistory') });
  }
  if (isObj(c.actionFees)) {
    const pricing = c.actionFees.pricing === 'fixed' ? 'fixed amounts' : "scaled by the epoch's fee multiplier";
    out.push({ text: 'fees', detail: `Action fees (${pricing}): ${feeLines(c.actionFees)}.`, tone: 'money', href: kw('action-fees') });
  }
  if (isObj(c.tokenCost)) {
    out.push({ text: 'token cost', detail: `Token costs: ${tokenCostLines(c.tokenCost)}.`, tone: 'money', href: kw('token-cost') });
  }
  if (c.documentsCountable === true || typeof c.documentsAverageable === 'string') {
    out.push({ text: 'count', detail: "Keeps a count of the type's documents.", tone: 'aggregate', href: kw('aggregates', 'documentscountable') });
  }
  if (typeof c.documentsSummable === 'string' || typeof c.documentsAverageable === 'string') {
    const p = (c.documentsSummable ?? c.documentsAverageable) as string;
    out.push({ text: `Σ ${p}`, detail: `Keeps the sum of "${p}" over the type's documents.`, tone: 'aggregate', href: kw('aggregates', 'documentssummable') });
  }
  const typeRange = ['rangeCountable', 'rangeSummable', 'rangeAverageable'].filter((k) => c[k] === true);
  if (typeRange.length) {
    out.push({ text: 'id ranges', detail: `${typeRange.join(', ')}: provable aggregates over ranges of document ids.`, tone: 'aggregate', href: kw('aggregates') });
  }
  if (c.signatureSecurityLevelRequirement !== undefined && c.signatureSecurityLevelRequirement !== 2) {
    const level = SECURITY_LEVEL[String(c.signatureSecurityLevelRequirement)] ?? String(c.signatureSecurityLevelRequirement);
    out.push({ text: `sig ${level}`, detail: `Transitions must be signed with a key of security level ${level} or stronger.`, tone: 'access', href: kw('signing-keys', 'signaturesecuritylevelrequirement') });
  }
  for (const [k, what] of [
    ['requiresIdentityEncryptionBoundedKey', 'encryption'],
    ['requiresIdentityDecryptionBoundedKey', 'decryption'],
  ] as const) {
    if (c[k] === undefined || c[k] === null) continue;
    out.push({
      text: `${what === 'encryption' ? 'enc' : 'dec'} keys`,
      detail: `Identities may bind ${what} keys to this type (${BOUNDED_KEY[String(c[k])] ?? c[k]}).`,
      tone: 'access',
      href: kw('signing-keys', `requiresidentity${what}boundedkey`),
    });
  }
  return out;
}

/** Keywords of an index, as chips. */
export function indexChips(index: Index): Chip[] {
  const o = index.options;
  const out: Chip[] = [];
  if (isObj(o.contested)) {
    const how = o.contested.resolution === 1 ? 'a masternode vote without lock' : 'a masternode vote';
    out.push({ text: 'contested', detail: `Matching values are decided by ${how}, not first come.`, tone: 'access', href: kw('contested') });
  }
  if (o.nullSearchable === false) {
    out.push({ text: 'no nulls', detail: 'Documents whose indexed values are all null are left out.', tone: 'neutral', href: kw('indexes', 'nullsearchable') });
  }
  if (o.countable === true || o.countable === 'countable' || o.countable === 'countableAllowingOffset' || typeof o.averageable === 'string') {
    out.push({ text: o.countable === 'countableAllowingOffset' ? 'count+offset' : 'count', detail: 'Keeps a document count per indexed value.', tone: 'aggregate', href: kw('aggregates', 'countable') });
  }
  const sum = (o.summable ?? o.averageable) as unknown;
  if (typeof sum === 'string') {
    out.push({ text: `Σ ${sum}`, detail: `Keeps the sum of "${sum}" per indexed value.`, tone: 'aggregate', href: kw('aggregates', 'summable') });
  }
  const range = ['rangeCountable', 'rangeSummable', 'rangeAverageable'].filter((k) => o[k] === true);
  if (range.length) {
    out.push({ text: 'range', detail: `${range.join(', ')}: provable aggregates over ranges of the indexed value.`, tone: 'aggregate', href: kw('aggregates') });
  }
  const ranked = ['rankedCountable', 'rankedSummable', 'rankedAverageable'].filter((k) => o[k] !== undefined && o[k] !== false);
  if (ranked.length) {
    const at = isObj(o.rankedCountable) && o.rankedCountable.at !== undefined ? ` at ${[o.rankedCountable.at].flat().join(', ')}` : '';
    const RANK_BY: Record<string, string> = { rankedCountable: 'count', rankedSummable: 'sum', rankedAverageable: 'avg' };
    const by = ranked.map((k) => RANK_BY[k]).join('/');
    out.push({ text: `top-K ${by}`, detail: `Orders the indexed values by ${by}${at}, for "top K" queries.`, tone: 'aggregate', href: kw('ranked') });
  }
  if (isObj(o.timeRange)) {
    const t = o.timeRange;
    const range = typeof t.range === 'number' ? formatDuration(t.range) : '?';
    const step = typeof t.step === 'number' ? formatDuration(t.step) : '?';
    const ttl = typeof t.ttl === 'number' ? `, entries expire after ${formatDuration(t.ttl)}` : '';
    out.push({ text: `window ${range}/${step}`, detail: `Buckets ${t.on ?? '$createdAt'} into ${range} windows starting every ${step}${ttl}.`, tone: 'aggregate', href: kw('time-range') });
  }
  if (o.terminal !== undefined) {
    const t = [o.terminal].flat().join(', ');
    out.push({ text: `→ ${t}`, detail: `Each entry is keyed by ${t} in place of the document id.`, tone: 'storage', href: kw('index-only', 'terminal') });
  }
  if (o.preallocated === true) {
    out.push({ text: 'prealloc', detail: "The index's trees are created with the referenced document.", tone: 'storage', href: kw('index-only', 'preallocated') });
  }
  if (o.skipIfAbsent === true) {
    out.push({ text: 'skip absent', detail: 'A document without the first property writes no entry.', tone: 'storage', href: kw('index-only', 'skipifabsent') });
  }
  return out;
}

/** Per-field markers shown beside the name. */
export function fieldChips(field: Field): Chip[] {
  const out: Chip[] = [];
  if (field.immutable) {
    out.push(
      field.allowSettingOnce
        ? { text: 'set once', detail: 'Immutable, but a replace may set it once while it has no value.', tone: 'lifecycle', href: kw('mutability', 'immutableallowsetting') }
        : { text: 'fixed', detail: 'Immutable: frozen at creation on a mutable type.', tone: 'lifecycle', href: kw('mutability', 'immutable') },
    );
  }
  if (field.transient) {
    out.push({ text: 'transient', detail: 'Validated on the transition but never stored.', tone: 'storage', href: kw('transient') });
  }
  if (field.requiredSince !== undefined) {
    out.push({ text: `v${field.requiredSince}+`, detail: `Required from contract version ${field.requiredSince}; older documents may leave it out.`, tone: 'lifecycle', href: kw('required-since') });
  }
  if (field.encryptedFor) {
    out.push({ text: 'enc', detail: `Encrypted for the identity in ${field.encryptedFor.recipient}.`, tone: 'access', href: kw('encrypted-for') });
  }
  if (field.distinctFrom) {
    out.push({ text: `≠ ${field.distinctFrom}`, detail: `Must differ from ${field.distinctFrom}.`, tone: 'access', href: kw('distinct-from') });
  }
  if (field.entryPayload) {
    out.push({ text: 'payload', detail: "Carried in each index entry's value (entryPayload).", tone: 'storage', href: kw('index-only', 'entrypayload') });
  }
  return out;
}

export type RefKind = 'document' | 'identity' | 'contract' | 'token' | 'key' | 'external';

export function refKind(t: RefTarget, local: boolean): RefKind {
  switch (t.type) {
    case 'identity':
      return 'identity';
    case 'contract':
      return 'contract';
    case 'token':
      return 'token';
    case 'identityPublicKey':
      return 'key';
    default:
      return local ? 'document' : 'external';
  }
}

export const REF_KIND_LABEL: Record<RefKind, string> = {
  document: 'document of this contract',
  external: "another contract's document",
  identity: 'identity',
  contract: 'data contract',
  token: 'token',
  key: 'identity key',
};

/** The book chapter for a reference target. */
export function refHref(t: RefTarget): string {
  if (t.lookup) return kw('refers-to-lookup');
  if (t.type === 'listElement') return kw('refers-to-list-element');
  return kw('refers-to', t.type.toLowerCase());
}

/** Contract-level settings (config, moderation) as label/value rows. */
export function contractSettingRows(config: Record<string, unknown> | undefined): Array<{ label: string; value: string; href?: string }> {
  if (!config) return [];
  const rows: Array<{ label: string; value: string; href?: string }> = [];
  const cfg = kw('contract-config');
  if (config.readonly === true) rows.push({ label: 'readonly', value: 'never updated', href: `${cfg}#readonly` });
  if (config.keepsHistory === true) rows.push({ label: 'keepsHistory', value: 'every version kept', href: `${cfg}#keepshistory` });
  if (config.canBeDeleted === true) rows.push({ label: 'canBeDeleted', value: 'yes', href: `${cfg}#canbedeleted` });
  if (config.sizedIntegerTypes === false) rows.push({ label: 'sizedIntegerTypes', value: 'off (8-byte integers)', href: `${cfg}#sizedintegertypes` });
  const defaults: string[] = [];
  if (config.documentsMutableContractDefault === false) defaults.push('immutable');
  if (config.documentsCanBeDeletedContractDefault === false) defaults.push('not deletable');
  if (config.documentsKeepHistoryContractDefault === true) defaults.push('keep history');
  if (defaults.length) rows.push({ label: 'type defaults', value: defaults.join(', '), href: `${cfg}#document-type-defaults` });
  for (const [k, what] of [
    ['requiresIdentityEncryptionBoundedKey', 'encryption keys'],
    ['requiresIdentityDecryptionBoundedKey', 'decryption keys'],
  ] as const) {
    if (config[k] !== undefined && config[k] !== null) rows.push({ label: what, value: BOUNDED_KEY[String(config[k])] ?? String(config[k]), href: `${cfg}#bounded-key-requirements` });
  }
  return rows;
}

/** A moderated contract's config.moderation, as label/value rows. */
export function moderationRows(moderation: unknown): Array<{ label: string; value: string }> {
  if (!isObj(moderation)) return [];
  const rows: Array<{ label: string; value: string }> = [];
  const lists = ['banlist', 'suspensions', 'warnings'].filter((k) => moderation[k] === true);
  rows.push({ label: 'lists', value: lists.length ? lists.join(', ') : 'none' });
  const m = isObj(moderation.moderators) ? moderation.moderators : undefined;
  if (!m) return rows;
  switch (m.$type) {
    case 'contractOwner':
      rows.push({ label: 'moderators', value: 'the contract owner' });
      break;
    case 'appointedModerators':
      rows.push({ label: 'moderators', value: `owner + ${Array.isArray(m.identities) ? m.identities.length : 0} appointed` });
      break;
    case 'elected': {
      rows.push({ label: 'moderators', value: 'an elected team' });
      if (typeof m.seatContestable === 'boolean') rows.push({ label: 'seat', value: m.seatContestable ? 'contestable' : 'held once seated' });
      if (typeof m.challengeCoolDown === 'number') rows.push({ label: 'challenge cool-down', value: formatDuration(m.challengeCoolDown) });
      if (typeof m.joinWindow === 'number') rows.push({ label: 'join window', value: formatDuration(m.joinWindow) });
      if (typeof m.voteWindow === 'number') rows.push({ label: 'vote window', value: formatDuration(m.voteWindow) });
      if (typeof m.electionDelay === 'number') rows.push({ label: 'election delay', value: formatDuration(m.electionDelay) });
      if (typeof m.maxAddedModerators === 'number') rows.push({ label: 'max added', value: String(m.maxAddedModerators) });
      if (m.ownerProtected === true) rows.push({ label: 'owner', value: 'protected from the team' });
      if (isObj(m.interim) && typeof m.interim.$type === 'string') rows.push({ label: 'interim', value: m.interim.$type });
      if (isObj(m.moderatedDocumentTypes)) {
        for (const [type, abilities] of Object.entries(m.moderatedDocumentTypes)) {
          const list = isObj(abilities)
            ? Object.entries(abilities).filter(([, v]) => v === true).map(([k]) => k)
            : Array.isArray(abilities)
              ? abilities
              : [];
          rows.push({ label: `moderates ${type}`, value: list.join(', ') || 'yes' });
        }
      }
      break;
    }
    default:
      rows.push({ label: 'moderators', value: String(m.$type) });
  }
  return rows;
}
