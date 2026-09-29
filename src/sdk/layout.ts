// Ask the Evo SDK for a document type's GroveDB layout. Drive computes it
// (`documentTypeLayout`, platform #5153) from the contract alone, so no
// network is needed.

import type { DocumentTypeLayout } from '../model/layout';
import { loadLocalSdk, localContract } from './local';

export { contractJsonForSdk } from './local';

/** The SDK in use predates `documentTypeLayout`. */
export class LayoutUnavailableError extends Error {}

export async function loadDocumentTypeLayout(contractJson: unknown, documentType: string): Promise<DocumentTypeLayout> {
  const sdk = await loadLocalSdk();
  if (typeof sdk.documentTypeLayout !== 'function') {
    throw new LayoutUnavailableError(
      'This build of the visualizer uses an @dashevo/evo-sdk without documentTypeLayout (added by dashpay/platform#5153). It appears with the next SDK release.',
    );
  }
  const { contract, platformVersion } = localContract(sdk, contractJson);
  return sdk.documentTypeLayout(contract, documentType, platformVersion) as DocumentTypeLayout;
}
