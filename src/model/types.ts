// The view-agnostic model the diagram renders from. Built by introspect.ts
// from a contract's document schemas; relationships added by relationships.ts.

export interface Field {
  name: string;
  /** Display type: 'string' | 'integer' | 'identifier' | 'bytes' | 'array<…>' | … */
  type: string;
  required: boolean;
  /** A platform system field ($id, $createdAt, …). */
  system: boolean;
  position?: number;
  /** Appears in at least one index. */
  indexed: boolean;
  /** Appears in a unique index (a de-facto identifier for the entity). */
  unique: boolean;
  /** Remaining JSON-schema constraints (maxLength, enum, minItems, …) for the inspector. */
  constraints: Record<string, unknown>;
  description?: string;
}

export interface IndexField {
  field: string;
  direction: 'asc' | 'desc';
}

export interface Index {
  name: string;
  fields: IndexField[];
  unique: boolean;
}

export interface Entity {
  /** Document type name. */
  name: string;
  fields: Field[];
  indices: Index[];
  /** Document-type config flags (documentsMutable, canBeDeleted, creationRestrictionMode, …). */
  config: Record<string, unknown>;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Relationship {
  id: string;
  /** Referencing entity (holds the foreign field). */
  from: string;
  /** Referenced entity. */
  to: string;
  fromField: string;
  toField: string;
  confidence: Confidence;
  /** Human-readable explanation of why this edge was inferred. */
  reason: string;
}

export interface ContractModel {
  contractId?: string;
  ownerId?: string;
  version?: number;
  entities: Entity[];
  relationships: Relationship[];
}
