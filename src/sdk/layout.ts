// Ask the Evo SDK for a document type's GroveDB layout. Drive computes it
// (`documentTypeLayout`, platform #5153) from the contract alone, so no
// network is needed; the SDK chunk loads on first use.

import type { DocumentTypeLayout } from '../model/layout';

/** The SDK in use predates `documentTypeLayout`. */
export class LayoutUnavailableError extends Error {}

interface LayoutSdk {
  ensureInitialized: () => Promise<void>;
  DataContract: { fromJSON: (json: unknown, fullValidation: boolean, platformVersion: unknown) => unknown };
  PlatformVersion: { latest: () => unknown };
  documentTypeLayout?: (contract: unknown, documentTypeName: string, platformVersion: unknown) => unknown;
}

const PLACEHOLDER_ID = '11111111111111111111111111111111';

/**
 * The contract JSON the SDK accepts: a pasted bare map of document schemas is
 * wrapped, and a file without an id, owner or version gets placeholders (the
 * layout does not depend on them).
 */
export function contractJsonForSdk(input: unknown): Record<string, unknown> {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const schemas = obj.documentSchemas ?? obj.schemas ?? obj.documents;
  const base: Record<string, unknown> = schemas && typeof schemas === 'object' ? { ...obj, documentSchemas: schemas } : { documentSchemas: obj };
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

export async function loadDocumentTypeLayout(contractJson: unknown, documentType: string): Promise<DocumentTypeLayout> {
  const sdk = (await import('@dashevo/evo-sdk')) as unknown as LayoutSdk;
  await sdk.ensureInitialized();
  if (typeof sdk.documentTypeLayout !== 'function') {
    throw new LayoutUnavailableError(
      'This build of the visualizer uses an @dashevo/evo-sdk without documentTypeLayout (added by dashpay/platform#5153). It appears with the next SDK release.',
    );
  }
  const platformVersion = sdk.PlatformVersion.latest();
  const contract = sdk.DataContract.fromJSON(contractJsonForSdk(contractJson), false, platformVersion);
  return sdk.documentTypeLayout(contract, documentType, platformVersion) as DocumentTypeLayout;
}
