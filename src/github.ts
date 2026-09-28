// Read a GitHub pull request's changed JSON files through the public REST API
// (unauthenticated: 60 requests an hour per IP; a PR costs three or four), and
// give each file's raw link at the merge base and at the head, which is what
// GitHub's "Files changed" tab compares.

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export interface PrFile {
  path: string;
  previousPath?: string;
  status: string;
  /** Raw link at the merge base; absent for an added file. */
  baseUrl?: string;
  /** Raw link at the head; absent for a removed file. */
  headUrl?: string;
}

export interface PrInfo {
  ref: PrRef;
  url: string;
  title: string;
  baseSha: string;
  headSha: string;
  files: PrFile[];
}

/** github.com/<owner>/<repo>/pull/<n> (with or without /files etc.), or owner/repo#n. */
export function parsePrUrl(input: string): PrRef | undefined {
  const text = input.trim();
  const short = text.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (short) return { owner: short[1], repo: short[2], number: Number(short[3]) };
  try {
    const url = new URL(text);
    if (url.hostname !== 'github.com') return undefined;
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : undefined;
  } catch {
    return undefined;
  }
}

const raw = (repo: string, sha: string, path: string) =>
  `https://raw.githubusercontent.com/${repo}/${sha}/${path.split('/').map(encodeURIComponent).join('/')}`;

async function api<T>(path: string, fetchImpl: typeof fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit' });
  } catch {
    throw new Error('Could not reach api.github.com.');
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error('GitHub API rate limit reached (60 requests an hour without signing in). Try again later, or compare the two file links directly.');
  }
  if (res.status === 404) throw new Error('Pull request not found (it may be in a private repository).');
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}.`);
  return (await res.json()) as T;
}

interface ApiPull {
  title: string;
  html_url: string;
  base: { sha: string; repo: { full_name: string } };
  head: { sha: string; repo: { full_name: string } | null };
}
interface ApiFile {
  filename: string;
  previous_filename?: string;
  status: string;
}

/** The PR, its merge base and its changed JSON files (at most 300 files are listed). */
export async function loadPr(ref: PrRef, fetchImpl: typeof fetch = fetch): Promise<PrInfo> {
  const repoPath = `/repos/${ref.owner}/${ref.repo}`;
  const pull = await api<ApiPull>(`${repoPath}/pulls/${ref.number}`, fetchImpl);
  const headRepo = pull.head.repo?.full_name ?? pull.base.repo.full_name;
  // Compare against the merge base, not the base branch tip, which may have moved on.
  // A PR's head commit is reachable in the base repository (refs/pull/<n>/head), forks included.
  const compare = await api<{ merge_base_commit: { sha: string } }>(
    `${repoPath}/compare/${pull.base.sha}...${pull.head.sha}`,
    fetchImpl,
  ).catch(() => ({ merge_base_commit: { sha: pull.base.sha } }));
  const baseSha = compare.merge_base_commit.sha;

  const files: ApiFile[] = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await api<ApiFile[]>(`${repoPath}/pulls/${ref.number}/files?per_page=100&page=${page}`, fetchImpl);
    files.push(...batch);
    if (batch.length < 100) break;
  }

  return {
    ref,
    url: pull.html_url,
    title: pull.title,
    baseSha,
    headSha: pull.head.sha,
    files: files
      .filter((f) => f.filename.toLowerCase().endsWith('.json'))
      .map((f) => {
        const previous = f.previous_filename ?? f.filename;
        return {
          path: f.filename,
          previousPath: f.previous_filename,
          status: f.status,
          baseUrl: f.status === 'added' ? undefined : raw(pull.base.repo.full_name, baseSha, previous),
          headUrl: f.status === 'removed' ? undefined : raw(headRepo, pull.head.sha, f.filename),
        };
      }),
  };
}
