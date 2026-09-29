// Ask the Evo SDK what creating a document of a type costs. Drive computes it
// (`documentCreateCost`) from the contract alone, so no network is needed.

import type { CostOptions, DocumentCreateCost } from '../model/cost';
import { loadLocalSdk, localContract } from './local';

/** The SDK in use predates `documentCreateCost`. */
export class CostUnavailableError extends Error {}

export async function loadDocumentCreateCost(
  contractJson: unknown,
  documentType: string,
  options: CostOptions = {},
): Promise<DocumentCreateCost> {
  const sdk = await loadLocalSdk();
  if (typeof sdk.documentCreateCost !== 'function') {
    throw new CostUnavailableError(
      'This build of the visualizer uses an @dashevo/evo-sdk without documentCreateCost. The cost estimate appears with the next SDK release.',
    );
  }
  const { contract, platformVersion } = localContract(sdk, contractJson);
  return sdk.documentCreateCost(contract, documentType, options, platformVersion) as DocumentCreateCost;
}
