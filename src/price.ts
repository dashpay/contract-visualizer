// The Dash price in US dollars, from public price APIs (both allow requests
// from any origin): CoinGecko first, Coinbase if it fails. Kept for five
// minutes. A price the viewer types in overrides it and is remembered in this
// browser.

export interface DashPrice {
  usd: number;
  source: string;
  at: Date;
}

const SOURCES: Array<{ name: string; url: string; read: (body: unknown) => unknown }> = [
  {
    name: 'CoinGecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=dash&vs_currencies=usd',
    read: (body) => (body as { dash?: { usd?: unknown } })?.dash?.usd,
  },
  {
    name: 'Coinbase',
    url: 'https://api.coinbase.com/v2/prices/DASH-USD/spot',
    read: (body) => Number((body as { data?: { amount?: unknown } })?.data?.amount),
  },
];

const KEEP_MS = 5 * 60 * 1000;
const OVERRIDE_KEY = 'cv-dash-usd-override';

let cached: DashPrice | null = null;

/** The price from the first source that answers with one, or null. */
export async function fetchDashPrice(fetcher: typeof fetch = fetch): Promise<DashPrice | null> {
  if (cached && Date.now() - cached.at.getTime() < KEEP_MS) return cached;
  for (const source of SOURCES) {
    try {
      const response = await fetcher(source.url);
      if (!response.ok) continue;
      const usd = source.read(await response.json());
      if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
        cached = { usd, source: source.name, at: new Date() };
        return cached;
      }
    } catch {
      // try the next source
    }
  }
  return null;
}

/** Forget the kept price (for tests). */
export function clearPriceCache(): void {
  cached = null;
}

export function readPriceOverride(): number | null {
  try {
    const value = Number(localStorage.getItem(OVERRIDE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writePriceOverride(usd: number | null): void {
  try {
    if (usd === null) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, String(usd));
  } catch {
    // not remembered in this browser
  }
}
