import { useCallback, useEffect, useState } from 'react';
import { fetchDashPrice, readPriceOverride, writePriceOverride, type DashPrice } from '../price';

/**
 * The Dash price to show amounts in dollars with: the one the viewer typed
 * in, else the fetched one (null while loading or when no source answers).
 */
export function useDashPrice(): {
  usdPerDash: number | null;
  fetched: DashPrice | null;
  override: number | null;
  setOverride: (usd: number | null) => void;
} {
  const [fetched, setFetched] = useState<DashPrice | null>(null);
  const [override, setOverrideState] = useState<number | null>(() => readPriceOverride());

  useEffect(() => {
    let alive = true;
    void fetchDashPrice().then((price) => alive && setFetched(price));
    return () => {
      alive = false;
    };
  }, []);

  const setOverride = useCallback((usd: number | null) => {
    writePriceOverride(usd);
    setOverrideState(usd);
  }, []);

  return { usdPerDash: override ?? fetched?.usd ?? null, fetched, override, setOverride };
}
