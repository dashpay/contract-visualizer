// Fetch a data contract via the Evo SDK and build the diagram model.
//
// The SDK (with its inlined WASM, several MB) is imported on the first network
// fetch only, so examples and pasted JSON render without downloading it.

import type { AppConfig } from '../config';
import { exampleKey, findExample } from '../examples';
import { fetchContractJson, urlFromSource } from '../urlSource';
import { modelFromPastedJson } from '../model/introspect';
import { withRelationships } from '../model/relationships';
import type { ContractModel } from '../model/types';

export async function loadContractModel(config: AppConfig): Promise<ContractModel> {
  const url = urlFromSource(config.contractId);
  if (url) return withRelationships(modelFromPastedJson(await fetchContractJson(url)));

  const key = exampleKey(config.contractId);
  if (key) {
    const example = findExample(key);
    if (!example) throw new Error(`No bundled example named "${key}".`);
    return withRelationships(modelFromPastedJson(example.contract));
  }

  const { getConnectedSdk } = await import('./client');
  const sdk = await getConnectedSdk(config);
  const contract = await sdk.contracts.fetch(config.contractId);
  if (!contract) {
    throw new Error(`Contract ${config.contractId} not found on ${config.network}.`);
  }

  // toJSON carries everything the diagram reads: documentSchemas (with every
  // keyword as written), schemaDefs, config (moderation included), groups,
  // tokens, keywords, description and the timestamps. It needs a platform
  // version; the SDK's is the network's.
  let json: Record<string, unknown>;
  try {
    json = contract.toJSON(sdk.version()) as Record<string, unknown>;
  } catch {
    // Fall back to the schemas alone if this contract format cannot be serialized here.
    json = {
      id: String(contract.id),
      ownerId: String(contract.ownerId),
      version: typeof contract.version === 'number' ? contract.version : undefined,
      documentSchemas: contract.schemas,
    };
  }
  if (!json.documentSchemas) json.documentSchemas = contract.schemas;
  if (typeof json.id !== 'string') json.id = String(contract.id);
  if (typeof json.ownerId !== 'string') json.ownerId = String(contract.ownerId);

  return withRelationships(modelFromPastedJson(json));
}
