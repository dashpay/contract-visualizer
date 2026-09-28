// The Evo SDK functions that run locally, from a contract's JSON alone:
// Drive's `documentTypeLayout` and `documentCreateCost`. The SDK chunk loads
// on first use; a function the installed SDK predates is reported as missing.

export interface LocalSdk {
  ensureInitialized: () => Promise<void>;
  DataContract: { fromJSON: (json: unknown, fullValidation: boolean, platformVersion: unknown) => unknown };
  PlatformVersion: { latest: () => unknown };
  documentTypeLayout?: (contract: unknown, documentTypeName: string, platformVersion: unknown) => unknown;
  documentCreateCost?: (
    contract: unknown,
    documentTypeName: string,
    options: unknown,
    platformVersion: unknown,
  ) => unknown;
}

const PLACEHOLDER_ID = '11111111111111111111111111111111';

/**
 * The contract JSON the SDK accepts: a pasted bare map of document schemas is
 * wrapped, and a file without an id, owner or version gets placeholders (what
 * the local functions compute does not depend on them).
 */
export function contractJsonForSdk(input: unknown): Record<string, unknown> {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const schemas = obj.documentSchemas ?? obj.schemas ?? obj.documents;
  const base: Record<string, unknown> =
    schemas && typeof schemas === 'object' ? { ...obj, documentSchemas: schemas } : { documentSchemas: obj };
  delete base.schemas;
  delete base.documents;
  return {
    $formatVersion: '1',
    version: 1,
    ...base,
    id: typeof base.id === 'string' ? base.id : PLACEHOLDER_ID,
    ownerId: typeof base.ownerId === 'string' ? base.ownerId : PLACEHOLDER_ID,
  };
}

export async function loadLocalSdk(): Promise<LocalSdk> {
  const sdk = (await import('@dashevo/evo-sdk')) as unknown as LocalSdk;
  await sdk.ensureInitialized();
  return sdk;
}

/** The contract in the SDK's form, with the latest platform version. */
export function localContract(sdk: LocalSdk, contractJson: unknown): { contract: unknown; platformVersion: unknown } {
  const platformVersion = sdk.PlatformVersion.latest();
  const contract = sdk.DataContract.fromJSON(contractJsonForSdk(contractJson), false, platformVersion);
  return { contract, platformVersion };
}
