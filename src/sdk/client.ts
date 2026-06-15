// Read-only Evo SDK connection management.
//
// We use the *trusted* presets so Platform proofs are verified (the SDK
// pre-fetches quorum public keys). Connections are memoised per network — the
// contract id is only a per-query parameter, so changing it reuses the socket.

import { EvoSDK } from '@dashevo/evo-sdk';
import type { AppConfig, Network } from '../config';

const CONNECT_OPTS = {
  proofs: true,
  settings: { connectTimeoutMs: 15_000, timeoutMs: 30_000, retries: 5 },
} as const;

function createSdk(config: AppConfig): EvoSDK {
  switch (config.network) {
    case 'testnet':
      return EvoSDK.testnetTrusted(CONNECT_OPTS);
    case 'mainnet':
      return EvoSDK.mainnetTrusted(CONNECT_OPTS);
    case 'local':
      return EvoSDK.localTrusted(CONNECT_OPTS);
    case 'devnet':
      if (!config.devnetName) {
        throw new Error('Devnet requires a devnetName in config to derive the quorum context.');
      }
      return EvoSDK.devnetTrusted(config.devnetName, CONNECT_OPTS);
    default:
      throw new Error(`Unsupported network: ${config.network as string}`);
  }
}

const pool = new Map<string, Promise<EvoSDK>>();

function poolKey(config: AppConfig): string {
  return config.network === 'devnet' ? `devnet:${config.devnetName ?? ''}` : config.network;
}

/** Get a connected SDK for the configured network (memoised). */
export async function getConnectedSdk(config: AppConfig): Promise<EvoSDK> {
  const key = poolKey(config);
  let pending = pool.get(key);
  if (!pending) {
    pending = (async () => {
      const sdk = createSdk(config);
      await sdk.connect();
      return sdk;
    })();
    // Drop the cache entry if the connection attempt fails, so a later retry
    // can reconnect instead of re-awaiting a rejected promise forever.
    pending.catch(() => pool.delete(key));
    pool.set(key, pending);
  }
  return pending;
}

/** Reset all pooled connections (used when switching networks from the UI). */
export function resetConnections(): void {
  pool.clear();
}

export type { Network };
