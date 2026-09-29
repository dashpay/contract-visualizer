import { afterEach, describe, expect, it } from 'vitest';
import { clearPriceCache, fetchDashPrice } from './price';

function answer(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

afterEach(() => clearPriceCache());

describe('fetchDashPrice', () => {
  it('reads the CoinGecko price', async () => {
    const price = await fetchDashPrice(async () => answer({ dash: { usd: 64.5 } }));
    expect(price).toMatchObject({ usd: 64.5, source: 'CoinGecko' });
  });

  it('falls back to Coinbase when CoinGecko fails', async () => {
    const seen: string[] = [];
    const price = await fetchDashPrice(async (url) => {
      seen.push(String(url));
      if (String(url).includes('coingecko')) throw new Error('rate limited');
      return answer({ data: { amount: '64.53', base: 'DASH', currency: 'USD' } });
    });
    expect(price).toMatchObject({ usd: 64.53, source: 'Coinbase' });
    expect(seen).toHaveLength(2);
  });

  it('gives up without a price when no source answers with one', async () => {
    expect(await fetchDashPrice(async () => answer({}, false))).toBeNull();
  });

  it('keeps a fetched price for a while', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return answer({ dash: { usd: 70 } });
    };
    await fetchDashPrice(fetcher);
    await fetchDashPrice(fetcher);
    expect(calls).toBe(1);
  });
});
