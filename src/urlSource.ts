// Load a contract from a JSON file on the web: ?url=<link>, or a link typed
// into the contract id box. Parsed locally like pasted JSON; the SDK is not
// involved, so an unregistered contract (a file in a pull request, say) works.

const PREFIX = 'url:';
/** Refuse anything larger: a contract is well under this. */
const MAX_BYTES = 5 * 1024 * 1024;

export function urlSourceId(url: string): string {
  return `${PREFIX}${url}`;
}

/** The link a source selects ('url:<link>'), if any. */
export function urlFromSource(source: string): string | undefined {
  return source.startsWith(PREFIX) ? source.slice(PREFIX.length) : undefined;
}

export function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

/**
 * The address to fetch for a link. GitHub page links (…/blob/<ref>/<path> and
 * …/raw/<ref>/<path>) become raw.githubusercontent.com links, since github.com
 * pages are HTML and do not allow cross-origin reads.
 */
export function toFetchableUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`"${input}" is not a valid URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Only http(s) links can be loaded, not ${url.protocol}`);
  }
  if (url.hostname === 'github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  return url.toString();
}

/** A short name for the file a link points at ('yappr-social-contract-v9'). */
export function fileLabel(input: string): string | undefined {
  try {
    const last = new URL(input.trim()).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/\.json$/i, '') : undefined;
  } catch {
    return undefined;
  }
}

/** Fetch and parse a contract JSON file. */
export async function fetchContractJson(input: string, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const url = toFetchableUrl(input);
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: 'omit' });
  } catch {
    throw new Error(
      `Could not fetch ${url}. The server may not allow cross-origin reads (CORS); raw.githubusercontent.com and gist.githubusercontent.com links work.`,
    );
  }
  if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error(`${url} is larger than 5 MB; that is not a contract.`);
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`${url} is not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}
