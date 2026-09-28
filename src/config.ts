// Initial app configuration: which contract to load, on which network, in
// which view. The contract can also be entered/pasted at runtime — this just
// seeds the first paint and powers shareable deep links.
//
// Resolution precedence (highest first):
//   1. URL query   — ?contract=<id>&network=testnet&view=uml, ?example=<key> (or ?demo=1),
//                    ?url=<link to a contract JSON file>
//   2. localStorage — last-used selection
//   3. build-time env — VITE_CONTRACT_ID / VITE_NETWORK / VITE_DEVNET_NAME
//   4. defaults

import { exampleId } from './examples';
import { urlSourceId } from './urlSource';

export type Network = 'testnet' | 'mainnet' | 'devnet' | 'local';
export type ViewKind = 'uml' | 'merise';

export interface AppConfig {
  network: Network;
  /** dash data contract id (base58), 'demo' / 'example:<key>', 'url:<link>', or '' when none chosen yet. */
  contractId: string;
  devnetName?: string;
  view: ViewKind;
}

const LS_KEY = 'contract-visualizer.config.v1';
const NETWORKS: Network[] = ['testnet', 'mainnet', 'devnet', 'local'];

function asNetwork(value: unknown, fallback: Network): Network {
  return typeof value === 'string' && (NETWORKS as string[]).includes(value)
    ? (value as Network)
    : fallback;
}

function asView(value: unknown, fallback: ViewKind): ViewKind {
  return value === 'uml' || value === 'merise' ? value : fallback;
}

function envDefaults(): AppConfig {
  const env = import.meta.env;
  return {
    network: asNetwork(env.VITE_NETWORK, 'testnet'),
    contractId: (env.VITE_CONTRACT_ID ?? '').trim(),
    devnetName: env.VITE_DEVNET_NAME?.trim() || undefined,
    view: asView(env.VITE_VIEW, 'uml'),
  };
}

function readOverride(): Partial<AppConfig> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppConfig>) : {};
  } catch {
    return {};
  }
}

function readUrlParams(): Partial<AppConfig> {
  try {
    const params = new URLSearchParams(window.location.search);
    const out: Partial<AppConfig> = {};
    if (params.get('demo') !== null) out.contractId = 'demo';
    const example = params.get('example');
    if (example) out.contractId = exampleId(example.trim());
    const url = params.get('url');
    if (url) out.contractId = urlSourceId(url.trim());
    const contract = params.get('contract') ?? params.get('contractId');
    if (contract) out.contractId = contract.trim();
    const network = params.get('network');
    if (network) out.network = asNetwork(network, 'testnet');
    const devnet = params.get('devnet') ?? params.get('devnetName');
    if (devnet) out.devnetName = devnet.trim();
    const view = params.get('view');
    if (view) out.view = asView(view, 'uml');
    return out;
  } catch {
    return {};
  }
}

export function saveOverride(patch: Partial<AppConfig>): void {
  try {
    const merged = { ...readOverride(), ...patch };
    localStorage.setItem(LS_KEY, JSON.stringify(merged));
  } catch {
    // storage unavailable (private window): the URL still carries the selection
  }
}

export function loadConfig(): AppConfig {
  return { ...envDefaults(), ...readOverride(), ...readUrlParams() };
}
