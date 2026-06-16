// Fetch a data contract via the Evo SDK and build the diagram model.

import type { AppConfig } from '../config';
import { getConnectedSdk } from './client';
import { DEMO_META, DEMO_SCHEMAS, isDemo } from '../model/demo';
import { toContractModel, type ContractMeta } from '../model/introspect';
import { withInferredRelationships } from '../model/relationships';
import type { ContractModel } from '../model/types';

export async function loadContractModel(config: AppConfig): Promise<ContractModel> {
  if (isDemo(config.contractId)) {
    return withInferredRelationships(toContractModel(DEMO_SCHEMAS, DEMO_META));
  }

  const sdk = await getConnectedSdk(config);
  const contract = await sdk.contracts.fetch(config.contractId);
  if (!contract) {
    throw new Error(`Contract ${config.contractId} not found on ${config.network}.`);
  }

  // `schemas` is the parsed docTypeName -> JSON-schema record (no platform
  // version needed). id/ownerId are Identifier objects -> base58 via String().
  const schemas = contract.schemas as Record<string, Record<string, unknown>>;
  const meta: ContractMeta = {
    contractId: String(contract.id),
    ownerId: String(contract.ownerId),
    version: typeof contract.version === 'number' ? contract.version : undefined,
  };

  // Contract-level config / groups / tokens aren't on `schemas`; pull them from
  // a full serialization. toJSON needs a platform version — use the SDK's, and
  // degrade gracefully if it's unavailable for this contract format.
  try {
    const json = contract.toJSON(sdk.version()) as Record<string, unknown>;
    if (json.config && typeof json.config === 'object') meta.config = json.config as Record<string, unknown>;
    if (json.groups && typeof json.groups === 'object') meta.groups = json.groups as Record<string, unknown>;
    if (json.tokens && typeof json.tokens === 'object') meta.tokens = json.tokens as Record<string, unknown>;
  } catch {
    // no contract-level metadata available — id/owner/version + per-type config still show
  }

  return withInferredRelationships(toContractModel(schemas, meta));
}
