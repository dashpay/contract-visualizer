// Load a contract, from any source, and build the diagram model.
//
// A source is a registered contract id (fetched from the configured network),
// 'url:<link>' (a JSON file on the web), or 'demo' / 'example:<key>' (a
// bundled example). The SDK (with its inlined WASM, several MB) is imported on
// the first network fetch only, so examples, links and pasted JSON render
// without downloading it.

import type { AppConfig } from '../config';
import { exampleKey, findExample } from '../examples';
import { fetchContractJson, urlFromSource } from '../urlSource';
import { modelFromPastedJson } from '../model/introspect';
import { withRelationships } from '../model/relationships';
import type { ContractModel } from '../model/types';

/** The contract's JSON form, as fetched, linked or bundled. */
export async function loadContractJson(config: AppConfig): Promise<unknown> {
  const url = urlFromSource(config.contractId);
  if (url) return fetchContractJson(url);

  const key = exampleKey(config.contractId);
  if (key) {
    const example = findExample(key);
    if (!example) throw new Error(`No bundled example named "${key}".`);
    return example.contract;
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
  return json;
}

export async function loadContractModel(config: AppConfig): Promise<ContractModel> {
  return withRelationships(modelFromPastedJson(await loadContractJson(config)));
}
