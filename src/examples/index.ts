// Bundled example contracts. They render offline and each one passes full
// validation by the protocol version 14 parser (DataContract.fromJSON with
// full validation in @dashevo/evo-sdk 4.2), so what they show is what the
// platform accepts.

import marketplace from './marketplace.json';
import moderationCharters from './moderation-charters.json';
import yapprLikes from './yappr-likes.json';
import dpns from './dpns.json';
import dashpay from './dashpay.json';
import appConnect from './app-connect.json';
import keywordSearch from './keyword-search.json';
import withdrawals from './withdrawals.json';
import dashQa from './dash-qa.json';

export interface Example {
  key: string;
  title: string;
  /** What the example is good for seeing. */
  summary: string;
  group: 'Protocol 14 features' | 'System contracts' | 'Other';
  contract: Record<string, unknown>;
  /** A system contract: the same id exists on every network that runs it. */
  system?: boolean;
}

export const EXAMPLES: Example[] = [
  {
    key: 'marketplace',
    title: 'Marketplace showcase',
    summary:
      'An illustrative contract (not registered anywhere) that uses the protocol 14 keywords together: references to documents, identities, keys, tokens and a DPNS name, anyOf, a creatorRefersTo rule, ttl, immutable, requiredSince, encryptedFor, transient, action fees, moderation, time-range and ranked indexes.',
    group: 'Protocol 14 features',
    contract: marketplace,
  },
  {
    key: 'moderation-charters',
    title: 'Moderation charters',
    summary:
      'The system contract behind elected moderation teams: lookups through unique indexes, list elements, property agreements, an anyOf ownerRefersTo, encrypted join requests and a contested seat.',
    group: 'Protocol 14 features',
    contract: moderationCharters,
    system: true,
  },
  {
    key: 'yappr-likes',
    title: 'Index-only likes and tips',
    summary:
      'Index-only document types from the Drive test suite (a Yappr-style feed): terminals, preallocated trees, skipIfAbsent, count / sum / ranked indexes and a time-range window.',
    group: 'Protocol 14 features',
    contract: yapprLikes,
  },
  {
    key: 'dpns',
    title: 'DPNS',
    summary: 'Dash Platform Name Service: contested names, preorders, transferable and tradeable domains.',
    group: 'System contracts',
    contract: dpns,
    system: true,
  },
  {
    key: 'dashpay',
    title: 'DashPay',
    summary: 'Profiles, contact info and encrypted contact requests.',
    group: 'System contracts',
    contract: dashpay,
    system: true,
  },
  {
    key: 'app-connect',
    title: 'App connect',
    summary: 'Login key responses for connecting apps to a wallet.',
    group: 'System contracts',
    contract: appConnect,
    system: true,
  },
  {
    key: 'keyword-search',
    title: 'Keyword search',
    summary: 'The search index over contract keywords and descriptions.',
    group: 'System contracts',
    contract: keywordSearch,
    system: true,
  },
  {
    key: 'withdrawals',
    title: 'Withdrawals',
    summary: 'Credit withdrawals to Core, created by the platform itself.',
    group: 'System contracts',
    contract: withdrawals,
    system: true,
  },
  {
    key: 'dash-qa',
    title: 'dash-qa (no declared references)',
    summary:
      'The QA dashboard contract, written before refersTo existed: every edge here is inferred from field names.',
    group: 'Other',
    contract: dashQa,
  },
];

export const DEFAULT_EXAMPLE = 'marketplace';

/** Names of the system contracts, by id (the same on every network that runs them). */
export const SYSTEM_CONTRACT_NAMES: Record<string, string> = {
  GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec: 'DPNS',
  Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7: 'DashPay',
  '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6': 'Withdrawals',
  rUnsWrFu3PKyRMGk2mxmZVBPbQuZx2qtHeFjURoQevX: 'Masternode reward shares',
  '43gujrzZgXqcKBiScLa4T8XTDnRhenR9BLx8GWVHjPxF': 'Token history',
  BsjE6tQxG47wffZCRQCovFx5rYrAYYC3rTVRWKro27LA: 'Keyword search',
  '6voHRaoiPcfmMhbqCA9dixH98xcgPQ9UEcuaXjpVu3LD': 'Document history',
  EG7RGfV8fDTayC2FyVr8HwdpJh3fXDbVztcfE94UmN88: 'Moderation charters',
  H8F9mP1BM55TE1ShsxPZHzhyinaMdY9bMmP85mkDhcJJ: 'App connect',
  '7CSFGeF4WNzgDmx94zwvHkYaG3Dx4XEe5LFsFgJswLbm': 'Wallet utils',
};

const PREFIX = 'example:';

/** The example key a contract id selects ('demo' or 'example:<key>'), if any. */
export function exampleKey(contractId: string): string | undefined {
  const id = contractId.trim();
  if (id.toLowerCase() === 'demo') return DEFAULT_EXAMPLE;
  if (id.startsWith(PREFIX)) return id.slice(PREFIX.length);
  return undefined;
}

export function exampleId(key: string): string {
  return `${PREFIX}${key}`;
}

export function findExample(key: string): Example | undefined {
  return EXAMPLES.find((e) => e.key === key);
}
