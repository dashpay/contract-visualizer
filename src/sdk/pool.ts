// Pooled SDK connections, kept apart from client.ts so resetting them does not
// pull the (large, lazily loaded) Evo SDK into the initial bundle.

export const pool = new Map<string, Promise<unknown>>();

/** Reset all pooled connections (used when switching networks from the UI). */
export function resetConnections(): void {
  pool.clear();
}
