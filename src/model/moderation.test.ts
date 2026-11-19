import { describe, expect, it } from 'vitest';
import { modelFromPastedJson } from './introspect';
import { withRelationships } from './relationships';
import { moderationBandLines, moderationOverview, removalRecordFields, settledText } from './moderation';
import { DEFAULT_FILTERS, recordNodeId, RECORD_HANDLE, toEdges, toNodes, type EntityNodeData, type RecordNodeData } from '../flow/diagramToFlow';

// Trimmed from Yappr social v19: an elected team, posts deletable for a day and
// then by the leader and one member, reports whose status only moderators write.
const contract = {
  $formatVersion: '1',
  version: 1,
  config: {
    moderation: {
      banlist: true,
      suspensions: true,
      warnings: true,
      moderators: {
        $type: 'elected',
        joinWindow: 604800,
        voteWindow: 259200,
        seatContestable: true,
        challengeCoolDown: 2592000,
        maxAddedModerators: 10,
        moderatedDocumentTypes: { post: ['deleteDocuments', 'ban', 'suspend', 'warn'], report: ['deleteDocuments', 'changeDocumentFields'] },
        interim: { $type: 'contractOwner' },
        ownerProtected: false,
      },
    },
  },
  documentSchemas: {
    post: {
      type: 'object',
      canBeDeleted: false,
      moderatorAbilities: {
        delete: true,
        deleteWithin: 86400,
        deleteSettled: { leader: true, approvals: 2 },
        deleteKeepsFields: ['tags', '$createdAt'],
      },
      properties: {
        text: { type: 'string', maxLength: 500, position: 0 },
        tags: { type: 'array', items: { type: 'string', maxLength: 20 }, maxItems: 5, position: 1 },
      },
      required: ['$createdAt', '$updatedAt', 'text'],
      additionalProperties: false,
    },
    like: {
      type: 'object',
      properties: {
        postId: { type: 'identifier', position: 0, refersTo: { type: 'moderatedDocument', documentType: 'post' } },
      },
      required: ['postId'],
      additionalProperties: false,
    },
    report: {
      type: 'object',
      documentsMutable: false,
      moderatorAbilities: { delete: true, deleteKeepsRecord: false, changeFields: ['status'] },
      properties: {
        reason: { type: 'integer', minimum: 0, maximum: 8, position: 0 },
        status: { type: 'integer', minimum: 1, maximum: 3, position: 1 },
      },
      required: ['$createdAt', 'reason'],
      additionalProperties: false,
    },
  },
};

const model = withRelationships(modelFromPastedJson(contract));
const overview = moderationOverview(model)!;
const type = (name: string) => overview.types.find((t) => t.type === name)!;

describe('moderationOverview', () => {
  it('should name an elected team, its interim and the contract-wide lists', () => {
    expect(overview.kind).toBe('elected');
    expect(overview.interim).toBe('the contract owner moderates until a team is seated');
    expect(overview.lists).toEqual(['banlist', 'suspensions', 'warnings']);
    expect(overview.election).toContainEqual({ label: 'leader may add', value: '10 members' });
  });

  it('should list only the types the moderators can act on', () => {
    expect(overview.types.map((t) => t.type)).toEqual(['post', 'report']);
  });

  it('should read the deletion window, the settled rule and the kept fields', () => {
    const post = type('post');
    expect(post.deleteWithin).toBe(86400);
    expect(post.settled).toEqual({ approvals: 2, leader: true, approversPredateDocument: true });
    expect(settledText(post.settled!)).toBe('the leader + 1 member delete it together');
    expect(post.keepsRecord).toBe(true);
    expect(post.keptFields).toEqual(['tags', '$createdAt']);
    expect(post.team).toEqual(['deleteDocuments', 'ban', 'suspend', 'warn']);
  });

  it('should say a deletion that keeps no record is final', () => {
    const report = type('report');
    expect(report.keepsRecord).toBe(false);
    expect(report.changeFields).toEqual(['status']);
    expect(moderationBandLines(report).map((l) => l.text)).toContain('final: no record, never restored');
  });

  it('should return undefined for a contract without moderation', () => {
    expect(moderationOverview(modelFromPastedJson({ documentSchemas: contract.documentSchemas }))).toBeUndefined();
  });
});

describe('removal record', () => {
  it('should hold the fixed fields and each kept field typed as the document types it', () => {
    const post = model.entities.find((e) => e.name === 'post')!;
    const fields = removalRecordFields(post, type('post'));
    expect(fields.slice(0, 6).map((f) => f.name)).toEqual(['documentId', 'documentOwnerId', 'moderatorId', 'reason', 'removedAt', 'documentHash']);
    expect(fields.filter((f) => f.kept).map((f) => [f.name, f.type])).toEqual([
      ['keptFields.tags', 'string[]'],
      ['keptFields.$createdAt', 'timestamp'],
    ]);
  });

  it('should mark the document fields its record keeps', () => {
    const post = model.entities.find((e) => e.name === 'post')!;
    expect(post.fields.filter((f) => f.keptOnRemoval).map((f) => f.path)).toEqual(['tags', '$createdAt']);
  });

  it('should draw a record node for a type that keeps records, reached from the band handle', () => {
    const edges = toEdges(model, 'uml', new Set(), DEFAULT_FILTERS);
    const nodes = toNodes(model, 'uml', edges);
    const edge = edges.find((e) => e.target === recordNodeId('post'))!;
    expect(edge.source).toBe('post');
    expect(edge.sourceHandle).toBe(RECORD_HANDLE);
    expect((nodes.find((n) => n.id === 'post')!.data as EntityNodeData).recordShown).toBe(true);
    const record = nodes.find((n) => n.id === recordNodeId('post'))!.data as RecordNodeData;
    expect(record.referrers).toEqual(['like.postId']);
    expect(nodes.some((n) => n.id === recordNodeId('report'))).toBe(false);
  });

  it('should hide the record nodes when records are filtered out', () => {
    const filters = { ...DEFAULT_FILTERS, records: false };
    const edges = toEdges(model, 'uml', new Set(), filters);
    expect(edges.some((e) => e.target.startsWith('record:'))).toBe(false);
    expect(toNodes(model, 'uml', edges, undefined, filters).some((n) => n.id.startsWith('record:'))).toBe(false);
  });
});
