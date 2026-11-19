// What a contract's moderators may do, per document type, and what a
// moderator's deletion leaves behind (the removal record). Pure functions of
// the model, so the canvas, the moderation panel and the inspector agree.
//
// Book: contract-keywords/moderator-abilities, contract-keywords/deletion,
// data-model/contract-moderation.

import { BOOK, formatDuration } from './describe';
import type { ContractModel, Entity } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export const MODERATION_HREF = {
  abilities: `${BOOK}contract-keywords/moderator-abilities.html`,
  delete: `${BOOK}contract-keywords/deletion.html#moderatorabilitiesdelete`,
  within: `${BOOK}contract-keywords/deletion.html#moderatorabilitiesdeletewithin`,
  settled: `${BOOK}contract-keywords/deletion.html#moderatorabilitiesdeletesettled`,
  record: `${BOOK}contract-keywords/deletion.html#moderatorabilitiesdeletekeepsrecord`,
  kept: `${BOOK}contract-keywords/deletion.html#moderatorabilitiesdeletekeepsfields`,
  refund: `${BOOK}contract-keywords/deletion.html#moderatorabilitiesdeleterefundsowner`,
  changeFields: `${BOOK}contract-keywords/moderator-abilities.html#changefields`,
  config: `${BOOK}contract-keywords/contract-config.html#moderation`,
  model: `${BOOK}data-model/contract-moderation.html`,
  restore: `${BOOK}data-model/contract-moderation.html#restoring-documents`,
};

/** How long after a deletion a moderator may restore the document (`SystemLimits::contract_document_restore_window_ms`). */
export const RESTORE_WINDOW_SECONDS = 604800;

/** The abilities an elected declaration's `moderatedDocumentTypes` may give the seated team on a type. */
export const TEAM_ABILITIES = ['deleteDocuments', 'changeDocumentFields', 'ban', 'suspend', 'warn'] as const;
export type TeamAbility = (typeof TEAM_ABILITIES)[number];

export const TEAM_ABILITY_LABEL: Record<TeamAbility, string> = {
  deleteDocuments: 'delete',
  changeDocumentFields: 'write fields',
  ban: 'ban author',
  suspend: 'suspend author',
  warn: 'warn author',
};

export interface SettledRule {
  approvals: number;
  leader: boolean;
  approversPredateDocument: boolean;
}

/** What the moderators may do to the documents of one type. */
export interface TypeModeration {
  type: string;
  /** moderatorAbilities.delete */
  canDelete: boolean;
  /** deleteWithin, seconds. */
  deleteWithin?: number;
  /** deleteSettled: past the window, the seated team deletes together. */
  settled?: SettledRule;
  /** deleteKeepsRecord (default true). */
  keepsRecord: boolean;
  /** deleteKeepsFields: what of the document stays public in the record. */
  keptFields: string[];
  /** deleteRefundsOwner (default false). */
  refundsOwner: boolean;
  /** changeFields: properties only the moderators write. */
  changeFields: string[];
  /** Elected contracts: what the declaration gives the seated team on this type. */
  team?: TeamAbility[];
  /** The type's owners cannot delete its documents (canBeDeleted: false). */
  ownersCannotDelete: boolean;
}

/** Who the moderators are and the contract-wide lists they keep. */
export interface ModerationOverview {
  kind: 'contractOwner' | 'appointedModerators' | 'elected' | string;
  /** A sentence: who moderates. */
  who: string;
  /** Contract-wide lists: banlist, suspensions, warnings. */
  lists: string[];
  /** Elected only: label/value rows of the election terms. */
  election: Array<{ label: string; value: string }>;
  /** Elected only: who moderates until a team is seated. */
  interim?: string;
  types: TypeModeration[];
}

function interimText(interim: unknown): string | undefined {
  if (!isObj(interim) || typeof interim.$type !== 'string') return undefined;
  switch (interim.$type) {
    case 'contractOwner':
      return 'the contract owner moderates until a team is seated';
    case 'appointedModerators':
      return `the owner and ${strings(interim.identities).length} appointed identities moderate until a team is seated`;
    case 'notYetUsable':
      return 'nobody moderates, and the moderated types refuse every write, until a team is seated';
    case 'noModeration':
      return 'nobody moderates, and every type works unmoderated, until a team is seated';
    default:
      return interim.$type;
  }
}

function teamAbilities(declared: unknown): TeamAbility[] {
  const list = isObj(declared)
    ? Object.entries(declared).filter(([, v]) => v === true).map(([k]) => k)
    : strings(declared);
  return TEAM_ABILITIES.filter((a) => list.includes(a));
}

/** One type's moderator abilities, or undefined when the moderators can do nothing to it. */
export function typeModeration(entity: Entity, team?: TeamAbility[]): TypeModeration | undefined {
  const mod = isObj(entity.config.moderatorAbilities) ? entity.config.moderatorAbilities : undefined;
  if (!mod && !team?.length) return undefined;
  const canDelete = mod?.delete === true;
  const keepsRecord = canDelete && mod?.deleteKeepsRecord !== false;
  const s = isObj(mod?.deleteSettled) ? mod.deleteSettled : undefined;
  const approvals = typeof s?.approvals === 'number' ? s.approvals : 1;
  return {
    type: entity.name,
    canDelete,
    deleteWithin: canDelete && typeof mod?.deleteWithin === 'number' ? mod.deleteWithin : undefined,
    settled: s
      ? {
          approvals,
          leader: s.leader === true,
          approversPredateDocument: typeof s.approversPredateDocument === 'boolean' ? s.approversPredateDocument : approvals > 1,
        }
      : undefined,
    keepsRecord,
    keptFields: keepsRecord ? strings(mod?.deleteKeepsFields) : [],
    refundsOwner: canDelete && mod?.deleteRefundsOwner === true,
    changeFields: strings(mod?.changeFields),
    team,
    ownersCannotDelete: entity.config.canBeDeleted === false,
  };
}

/** The contract's moderation, or undefined when its config declares none. */
export function moderationOverview(model: ContractModel): ModerationOverview | undefined {
  const moderation = model.config?.moderation;
  if (!isObj(moderation)) return undefined;
  const lists = ['banlist', 'suspensions', 'warnings'].filter((k) => moderation[k] === true);
  const m = isObj(moderation.moderators) ? moderation.moderators : undefined;
  const kind = typeof m?.$type === 'string' ? m.$type : 'contractOwner';
  const election: Array<{ label: string; value: string }> = [];
  let who: string;
  let teamByType: Record<string, TeamAbility[]> | undefined;
  switch (kind) {
    case 'contractOwner':
      who = 'The contract owner moderates.';
      break;
    case 'appointedModerators':
      who = `The contract owner and ${strings(m?.identities).length} appointed identities moderate.`;
      break;
    case 'elected': {
      who = 'An elected team moderates: a leader, the members its charter elects and the members the leader adds.';
      const d = (k: string) => (typeof m?.[k] === 'number' ? formatDuration(m[k] as number) : undefined);
      const push = (label: string, value: string | undefined) => value !== undefined && election.push({ label, value });
      push('join window', d('joinWindow'));
      push('vote window', d('voteWindow'));
      push('election delay', d('electionDelay'));
      if (typeof m?.seatContestable === 'boolean') push('seat', m.seatContestable ? 'contestable' : 'held once seated');
      push('challenge cool-down', d('challengeCoolDown'));
      if (typeof m?.maxAddedModerators === 'number') push('leader may add', `${m.maxAddedModerators} members`);
      push('contract owner', m?.ownerProtected === true ? 'protected from the team' : 'not protected');
      teamByType = {};
      if (isObj(m?.moderatedDocumentTypes)) {
        for (const [type, abilities] of Object.entries(m.moderatedDocumentTypes)) teamByType[type] = teamAbilities(abilities);
      }
      break;
    }
    default:
      who = `Moderators: ${kind}.`;
  }
  const types = model.entities
    .map((e) => typeModeration(e, teamByType?.[e.name]))
    .filter((t): t is TypeModeration => !!t);
  return { kind, who, lists, election, interim: kind === 'elected' ? interimText(m?.interim) : undefined, types };
}

/** Short lines for the moderation band on a canvas node. */
export function moderationBandLines(t: TypeModeration): Array<{ text: string; detail: string; href: string }> {
  const out: Array<{ text: string; detail: string; href: string }> = [];
  if (t.canDelete) {
    out.push({
      text: t.deleteWithin ? `delete any document ≤ ${formatDuration(t.deleteWithin)} after its last change` : 'delete any document, at any age',
      detail: t.deleteWithin
        ? `Any moderator deletes a document of this type, whoever owns it, up to ${formatDuration(t.deleteWithin)} after its last change.`
        : 'Any moderator deletes a document of this type, whoever owns it, at any time.',
      href: t.deleteWithin ? MODERATION_HREF.within : MODERATION_HREF.delete,
    });
    if (t.settled) out.push({ text: `then: ${settledText(t.settled)}`, detail: settledDetail(t.settled), href: MODERATION_HREF.settled });
    else if (t.deleteWithin) out.push({ text: 'then: settled, nobody deletes it', detail: 'Past the window no moderator deletes the document.', href: MODERATION_HREF.within });
    out.push(
      t.keepsRecord
        ? {
            text: `leaves a removal record${t.keptFields.length ? ` keeping ${t.keptFields.length} field${t.keptFields.length === 1 ? '' : 's'}` : ''} · restorable ${formatDuration(RESTORE_WINDOW_SECONDS)}`,
            detail: `Each deletion writes a removal record under the contract that is never deleted: whose document it was, which moderator removed it, why, when and a hash of it${t.keptFields.length ? `, plus ${t.keptFields.join(', ')}` : ''}. A moderator may restore the document from it for ${formatDuration(RESTORE_WINDOW_SECONDS)}${t.settled ? ', unless the team deleted it once settled' : ''}.`,
            href: MODERATION_HREF.record,
          }
        : { text: 'final: no record, never restored', detail: 'deleteKeepsRecord: false. The deletion leaves no removal record and can never be undone.', href: MODERATION_HREF.record },
    );
    out.push({
      text: t.refundsOwner ? 'owner is refunded its storage' : 'owner forfeits its storage',
      detail: t.refundsOwner ? 'deleteRefundsOwner: the deleted document’s storage is refunded to whoever paid for it.' : 'The deleted document’s storage is not refunded to anyone.',
      href: MODERATION_HREF.refund,
    });
  }
  if (t.changeFields.length) {
    out.push({
      text: `write ${t.changeFields.join(', ')}`,
      detail: `Only the moderators set or remove ${t.changeFields.join(', ')}, on any document of the type; its owner cannot.`,
      href: MODERATION_HREF.changeFields,
    });
  }
  return out;
}

export function settledText(s: SettledRule): string {
  if (s.leader && s.approvals <= 1) return 'the leader alone deletes it';
  if (s.leader) return `the leader + ${s.approvals - 1} member${s.approvals - 1 === 1 ? '' : 's'} delete it together`;
  return `${s.approvals} team member${s.approvals === 1 ? '' : 's'} delete it together`;
}

export function settledDetail(s: SettledRule): string {
  return `Past the window, the seated team deletes the document together: one member proposes and ${s.approvals} approval${s.approvals === 1 ? '' : 's'} are needed${s.leader ? ', the leader among them' : ''}. ${s.approversPredateDocument ? 'A member the leader added counts only for documents created after its addition.' : 'A member the leader added counts whenever added.'} Such a deletion is never restored.`;
}

/** One field of a removal record. */
export interface RecordField {
  name: string;
  type: string;
  detail: string;
  /** A value copied from the deleted document (deleteKeepsFields). */
  kept?: boolean;
  optional?: boolean;
}

/** The removal record a moderator's deletion writes for a document of this type (`ContractDocumentRemoval`). */
export function removalRecordFields(entity: Entity, t: TypeModeration): RecordField[] {
  const base: RecordField[] = [
    { name: 'documentId', type: 'identifier', detail: 'The id of the removed document: the record is keyed by it.' },
    { name: 'documentOwnerId', type: 'identifier', detail: 'Whose document it was.' },
    { name: 'moderatorId', type: 'identifier', detail: 'The moderator who removed it (for a settled deletion, the member whose approval ran it).' },
    { name: 'reason', type: 'reason', detail: 'Why: free text, and on an elected contract the reason document of the team’s proposal, plus the documents it cites.' },
    { name: 'removedAt', type: 'timestamp', detail: 'The block time of the deletion.' },
    { name: 'documentHash', type: 'bytes32', detail: 'sha256d of the document as serialized under its type: a restore must bring back exactly this document.' },
    { name: 'restoration', type: 'object', optional: true, detail: 'Once a moderator restores the document: who restored it and when. The record stays, marked restored.' },
  ];
  const kept = t.keptFields.map<RecordField>((path) => {
    const f = entity.fields.find((x) => x.path === path);
    return {
      name: `keptFields.${path}`,
      type: f ? (f.ref ?? f.type) : 'value',
      kept: true,
      optional: !f?.required,
      detail: `Copied from the document as it was at the deletion (deleteKeepsFields), so it stays public after the document is gone.${f?.required ? '' : ' Left out when the document held no value there.'}`,
    };
  });
  return [...base, ...kept];
}

/** Types whose documents other types refer to as `moderatedDocument`: a join reads the removal record once removed. */
export function moderatedReferrers(model: ContractModel, type: string): string[] {
  return [
    ...new Set(
      model.relationships
        .filter((r) => r.kind === 'declared' && r.to === type && r.target?.type === 'moderatedDocument')
        .map((r) => `${r.from}.${r.fromField}`),
    ),
  ];
}
