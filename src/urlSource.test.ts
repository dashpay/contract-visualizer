import { describe, expect, it } from 'vitest';
import { fetchContractJson, fileLabel, looksLikeUrl, toFetchableUrl, urlFromSource, urlSourceId } from './urlSource';

const RAW = 'https://raw.githubusercontent.com/PastaPastaPasta/yappr/429da9df940ff3196858982d4b7af81331180f3f/contracts/yappr-social-contract-v9.json';

describe('toFetchableUrl', () => {
  it('turns a GitHub page link into its raw file', () => {
    expect(
      toFetchableUrl('https://github.com/PastaPastaPasta/yappr/blob/429da9df940ff3196858982d4b7af81331180f3f/contracts/yappr-social-contract-v9.json'),
    ).toBe(RAW);
    // refs with a slash (branch names like beta5/contracts) keep their full path
    expect(toFetchableUrl('https://github.com/o/r/raw/beta5/contracts/c.json')).toBe('https://raw.githubusercontent.com/o/r/beta5/contracts/c.json');
  });

  it('keeps any other http(s) link and refuses other schemes', () => {
    expect(toFetchableUrl(RAW)).toBe(RAW);
    expect(() => toFetchableUrl('javascript:alert(1)')).toThrow(/http/);
    expect(() => toFetchableUrl('not a url')).toThrow(/not a valid URL/);
  });
});

describe('sources', () => {
  it('round-trips a link through a source id', () => {
    expect(urlFromSource(urlSourceId(RAW))).toBe(RAW);
    expect(urlFromSource('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec')).toBeUndefined();
  });

  it('tells a link from a contract id and names the file', () => {
    expect(looksLikeUrl(' https://x.test/c.json')).toBe(true);
    expect(looksLikeUrl('GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec')).toBe(false);
    expect(fileLabel(RAW)).toBe('yappr-social-contract-v9');
  });
});

describe('fetchContractJson', () => {
  const respond = (body: string, status = 200) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  it('fetches the raw form of a GitHub link and parses it', async () => {
    let asked = '';
    const fetchImpl = (async (url: string) => {
      asked = url;
      return new Response('{"documentSchemas":{}}');
    }) as unknown as typeof fetch;
    await expect(fetchContractJson('https://github.com/o/r/blob/main/c.json', fetchImpl)).resolves.toEqual({ documentSchemas: {} });
    expect(asked).toBe('https://raw.githubusercontent.com/o/r/main/c.json');
  });

  it('explains HTTP errors, network or CORS failures and non-JSON bodies', async () => {
    await expect(fetchContractJson(RAW, respond('nope', 404))).rejects.toThrow(/HTTP 404/);
    const failing = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(fetchContractJson(RAW, failing)).rejects.toThrow(/CORS/);
    await expect(fetchContractJson(RAW, respond('<html>'))).rejects.toThrow(/not JSON/);
  });
});
