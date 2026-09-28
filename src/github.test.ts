import { describe, expect, it } from 'vitest';
import { loadPr, parsePrUrl } from './github';

describe('parsePrUrl', () => {
  it('reads PR links and owner/repo#n', () => {
    expect(parsePrUrl('https://github.com/PastaPastaPasta/yappr/pull/577')).toEqual({ owner: 'PastaPastaPasta', repo: 'yappr', number: 577 });
    expect(parsePrUrl('https://github.com/PastaPastaPasta/yappr/pull/577/files#diff-1')).toMatchObject({ number: 577 });
    expect(parsePrUrl('dashpay/platform#5041')).toEqual({ owner: 'dashpay', repo: 'platform', number: 5041 });
  });

  it('refuses anything else', () => {
    expect(parsePrUrl('https://github.com/o/r/issues/1')).toBeUndefined();
    expect(parsePrUrl('https://gitlab.com/o/r/pull/1')).toBeUndefined();
    expect(parsePrUrl('577')).toBeUndefined();
  });
});

describe('loadPr', () => {
  const pull = {
    title: 'contract update',
    html_url: 'https://github.com/o/r/pull/7',
    base: { sha: 'basetip', repo: { full_name: 'o/r' } },
    head: { sha: 'headsha', repo: { full_name: 'fork/r' } },
  };
  const files = [
    { filename: 'contracts/a.json', status: 'modified' },
    { filename: 'contracts/new.json', status: 'added' },
    { filename: 'contracts/gone.json', status: 'removed' },
    { filename: 'contracts/b v2.json', previous_filename: 'contracts/b.json', status: 'renamed' },
    { filename: 'README.md', status: 'modified' },
  ];
  const asked: string[] = [];
  const fakeFetch = (async (url: string) => {
    asked.push(url);
    if (url.endsWith('/pulls/7')) return new Response(JSON.stringify(pull));
    if (url.includes('/compare/')) return new Response(JSON.stringify({ merge_base_commit: { sha: 'mergebase' } }));
    if (url.includes('/pulls/7/files')) return new Response(JSON.stringify(files));
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

  it('gives each JSON file its raw link at the merge base and at the fork head', async () => {
    const pr = await loadPr({ owner: 'o', repo: 'r', number: 7 }, fakeFetch);
    expect(pr).toMatchObject({ title: 'contract update', baseSha: 'mergebase', headSha: 'headsha' });
    expect(asked).toContain('https://api.github.com/repos/o/r/compare/basetip...headsha');
    expect(pr.files.map((f) => f.path)).toEqual(['contracts/a.json', 'contracts/new.json', 'contracts/gone.json', 'contracts/b v2.json']);
    const [a, added, removed, renamed] = pr.files;
    expect(a.baseUrl).toBe('https://raw.githubusercontent.com/o/r/mergebase/contracts/a.json');
    expect(a.headUrl).toBe('https://raw.githubusercontent.com/fork/r/headsha/contracts/a.json');
    expect(added.baseUrl).toBeUndefined();
    expect(removed.headUrl).toBeUndefined();
    expect(renamed.baseUrl).toBe('https://raw.githubusercontent.com/o/r/mergebase/contracts/b.json');
    expect(renamed.headUrl).toBe('https://raw.githubusercontent.com/fork/r/headsha/contracts/b%20v2.json');
  });

  it('explains the rate limit', async () => {
    const limited = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    await expect(loadPr({ owner: 'o', repo: 'r', number: 7 }, limited)).rejects.toThrow(/rate limit/);
  });
});
