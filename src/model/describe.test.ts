import { describe, expect, it } from 'vitest';
import { documentTypeChips, fieldChips, formatDuration, indexChips, moderationRows } from './describe';
import { modelFromPastedJson } from './introspect';
import marketplace from '../examples/marketplace.json';
import yappr from '../examples/yappr-likes.json';

const m = modelFromPastedJson(marketplace);
const entity = (name: string, model = m) => model.entities.find((e) => e.name === name)!;
const texts = (chips: Array<{ text: string }>) => chips.map((c) => c.text);

describe('formatDuration', () => {
  it('uses the largest whole unit', () => {
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(604800)).toBe('1w');
    expect(formatDuration(2592000)).toBe('30d');
    expect(formatDuration(31536000)).toBe('1y');
    expect(formatDuration(90)).toBe('90s');
  });
});

describe('documentTypeChips', () => {
  it('names the protocol 14 lifecycle, access and money keywords', () => {
    expect(texts(documentTypeChips(entity('listing')))).toEqual(['ttl 30d', 'mods delete ≤1w', 'fees', 'count']);
    expect(texts(documentTypeChips(entity('giftCard')))).toEqual(['no edits', 'transferable', 'for sale', 'logged']);
  });

  it('leaves defaults out', () => {
    expect(texts(documentTypeChips(entity('review')))).toEqual(['mods delete']);
  });

  it('flags an index-only type first', () => {
    const likes = modelFromPastedJson(yappr);
    expect(texts(documentTypeChips(entity('like', likes)))[0]).toBe('index-only');
  });
});

describe('indexChips', () => {
  it('describes aggregates, ranking, time windows and index-only keys', () => {
    const likes = modelFromPastedJson(yappr);
    const tip = entity('tip', likes).indices.find((i) => i.name === 'byPost')!;
    expect(texts(indexChips(tip))).toEqual(['count', 'Σ amount', 'range', 'top-K count/sum', '→ $ownerId']);
    const beat = entity('beat', likes).indices.find((i) => i.name === 'byHourHashtag')!;
    expect(texts(indexChips(beat))).toContain('window 1h/15m');
  });
});

describe('fieldChips', () => {
  it('marks per-property keywords', () => {
    const sku = entity('listing').fields.find((f) => f.path === 'sku')!;
    expect(texts(fieldChips(sku))).toEqual(['set once']);
    const note = entity('offer').fields.find((f) => f.path === 'note')!;
    expect(texts(fieldChips(note))).toEqual(['enc']);
    const photo = entity('listing').fields.find((f) => f.path === 'photoHash')!;
    expect(texts(fieldChips(photo))).toEqual(['v2+']);
  });
});

describe('moderationRows', () => {
  it('summarises an elected team', () => {
    const rows = moderationRows({
      banlist: true,
      moderators: {
        $type: 'elected',
        seatContestable: true,
        challengeCoolDown: 1209600,
        voteWindow: 604800,
        moderatedDocumentTypes: { post: { ban: true, deleteDocuments: true } },
      },
    });
    expect(rows).toEqual([
      { label: 'lists', value: 'banlist' },
      { label: 'moderators', value: 'an elected team' },
      { label: 'seat', value: 'contestable' },
      { label: 'challenge cool-down', value: '2w' },
      { label: 'vote window', value: '1w' },
      { label: 'moderates post', value: 'ban, deleteDocuments' },
    ]);
  });
});
