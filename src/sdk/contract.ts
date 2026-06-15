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
  return withInferredRelationships(toContractModel(schemas, meta));
}
