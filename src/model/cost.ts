// What creating a document of a type costs, as `documentCreateCost` in
// @dashevo/evo-sdk returns it (computed by Drive), and the helpers the cost
// panel shows it with.

/**
 * An amount under both storage scenarios: every index value new (the first
 * document with these values creates their trees) and every value already
 * stored (a later document with the same values adds only its own entries).
 */
export interface Scenarios {
  newValues: number;
  knownValues: number;
}

export type Scenario = keyof Scenarios;

export interface CostField {
  path: string;
  kind: string;
  optional: boolean;
  present: boolean;
  /** Only for a variable-size field. */
  length?: number;
  minLength?: number;
  maxLength?: number;
}

export type ContractCharge =
  | {
      kind: 'actionFee';
      pricing: 'feeMultiplier' | 'fixed';
      declared: { owner: number; moderators: number };
      charged: { owner: number; moderators: number };
    }
  | {
      kind: 'tokenCost';
      tokenPosition: number;
      amount: number;
      effect: 'transferToContractOwner' | 'burn';
      gasFeesPaidBy: string;
      optional: boolean;
      tokenContractId?: string;
    }
  | { kind: 'contestFund'; index: string; credits: number };

export interface DocumentCreateCost {
  documentType: string;
  assumptions: {
    existingDocuments: number;
    signatureKeyType: string;
    userFeeIncrease: number;
    feeMultiplierPermille: number;
    contenders: number;
  };
  documentBytes: number;
  creditsPerByte: number;
  creditsPerDash: number;
  storage: {
    bytes: Scenarios;
    credits: Scenarios;
    primaryBytes: Scenarios;
    preallocatedBytes: Scenarios;
    expirationBytes: Scenarios;
  };
  indexes: Array<{ name: string; sharedWith: string[]; sharedBytes: Scenarios; ownBytes: Scenarios }>;
  elements: Array<{
    role: string;
    path: string[];
    bytes: number;
    indexes: string[];
    ifAbsent: boolean;
    writtenWhenValuesKnown: boolean;
    ephemeral: boolean;
    expiration: boolean;
    rankingAxis?: string;
    referringType?: string;
  }>;
  processing: Array<{ code: string; text: string; credits: Scenarios; exact: boolean }>;
  processingCredits: Scenarios;
  contractCharges: ContractCharge[];
  refund: { sameEpoch?: Scenarios; afterOneYear?: Scenarios };
  totalCredits: Scenarios;
  fields: CostField[];
}

/** What to ask `documentCreateCost` for. */
export interface CostOptions {
  fields?: Record<string, { present?: boolean; length?: number }>;
  existingDocuments?: number;
  signatureKeyType?: string;
  userFeeIncrease?: number;
}

export const SIGNATURE_KEY_TYPES = ['ECDSA_SECP256K1', 'ECDSA_HASH160', 'EDDSA_25519_HASH160', 'BLS12_381', 'BIP13_SCRIPT_HASH'];

/** Storage bytes priced at the cost's rate. */
export function bytesToCredits(cost: DocumentCreateCost, bytes: number): number {
  return bytes * cost.creditsPerByte;
}

export function creditsToDash(cost: DocumentCreateCost, credits: number): number {
  return credits / cost.creditsPerDash;
}

/** `sharedBytes + ownBytes`: what the index would cost on its own. */
export function indexAlone(index: DocumentCreateCost['indexes'][number]): Scenarios {
  return {
    newValues: index.sharedBytes.newValues + index.ownBytes.newValues,
    knownValues: index.sharedBytes.knownValues + index.ownBytes.knownValues,
  };
}

/** Significant digits, without a long tail of zeros. */
function significant(value: number, digits: number): string {
  if (value === 0) return '0';
  return Number(value.toPrecision(digits)).toLocaleString('en-US', { maximumSignificantDigits: digits });
}

/** A Dash amount: `0.00189 DASH`. */
export function formatDash(dash: number): string {
  return `${significant(dash, 3)} DASH`;
}

/** A dollar amount: cents above a cent, significant digits below. */
export function formatUsd(usd: number): string {
  if (usd === 0) return '$0';
  if (usd >= 0.01) return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (usd < 0.000001) return '<$0.000001';
  return `$${significant(usd, 2)}`;
}

/** Credits in Dash, and in dollars when a price is known. */
export function formatCredits(cost: DocumentCreateCost, credits: number, usdPerDash: number | null): string {
  const dash = creditsToDash(cost, credits);
  return usdPerDash === null ? formatDash(dash) : `${formatDash(dash)} (${formatUsd(dash * usdPerDash)})`;
}

export function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString('en-US')} B`;
}

/** The fields worth a control: an optional one (present or not) or a variable-size one (its length). */
export function adjustableFields(cost: DocumentCreateCost): CostField[] {
  return cost.fields.filter((field) => field.optional || field.length !== undefined);
}
