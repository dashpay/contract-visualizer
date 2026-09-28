// The view-agnostic model the diagram renders from. Built by introspect.ts
// from a contract's document schemas; references are read from the schemas
// (refersTo, protocol version 14) and the remaining edges inferred by
// relationships.ts.

/** One target a reference may point at (a leaf of a refersTo declaration). */
export interface RefTarget {
  type:
    | 'identity'
    | 'contract'
    | 'token'
    | 'permanentDocument'
    | 'deletableDocument'
    | 'identityPublicKey'
    | 'listElement'
    | string;
  documentType?: string;
  /** The contract holding documentType, when it is not this one. */
  contractId?: string;
  propertyAgreement?: Record<string, string>;
  lookup?: { index: string; keys: Record<string, string> };
  inList?: string;
  keyIdProperty?: string;
  identityProperty?: string;
  keyRequirements?: { purpose?: string; boundTo?: string };
  contractRequirements?: Record<string, unknown>;
}

/** A refersTo declaration: one target, or an anyOf / allOf of declarations. */
export type RefExpr =
  | { op: 'target'; target: RefTarget }
  | { op: 'anyOf' | 'allOf'; operands: RefExpr[] };

/** Where a declaration sits: on a property, on each element of a typed array, or on the document type. */
export type RefSite = 'property' | 'element' | 'owner' | 'creator';

export interface Reference {
  /** Property path ('shopId', 'meta.userId'), with '[]' for typed array elements, or '$ownerId' / '$creatorId'. */
  path: string;
  site: RefSite;
  expr: RefExpr;
  raw: unknown;
}

export interface EncryptedFor {
  recipient: string;
  recipientKey?: string;
  senderKey?: string;
  scheme?: string;
}

export interface Field {
  /** Display name: the last path segment. */
  name: string;
  /** Full dotted path from the document root ('rewardSplit.leader'). Equals name at the top level. */
  path: string;
  /** Nesting depth: 0 for top-level properties. */
  depth: number;
  /** Display type: 'string' | 'integer' | 'identifier' | 'bytes' | 'string[]' | 'identifier[]' | 'object' | … */
  type: string;
  required: boolean;
  /** A platform system field ($id, $createdAt, …). */
  system: boolean;
  position?: number;
  /** Appears in at least one index. */
  indexed: boolean;
  /** Appears in a unique index (a de-facto identifier for the entity). */
  unique: boolean;
  /** JSON-schema constraints (maxLength, maxBytes, enum, minItems, …) for the inspector. */
  constraints: Record<string, unknown>;
  /** Element constraints of a typed array (`items`). */
  items?: Record<string, unknown>;
  /** The `$defs` entry a `$ref` resolved through. */
  ref?: string;
  description?: string;
  /** refersTo on the property, or on its typed array elements. */
  reference?: Reference;
  /** distinctFrom: '$ownerId' or another identifier path (on the property or its elements). */
  distinctFrom?: string;
  encryptedFor?: EncryptedFor;
  /** Listed in the document type's `immutable`. */
  immutable?: boolean;
  /** Listed in `immutableAllowSetting`: may be set once while it has no value. */
  allowSettingOnce?: boolean;
  /** Listed in `transient`: validated on the transition, never stored. */
  transient?: boolean;
  /** requiredSince: the contract version from which the property is required. */
  requiredSince?: number;
  /** Listed in an index-only type's `entryPayload`. */
  entryPayload?: boolean;
  /** The property schema as written (before $ref resolution; an object's members are fields of their own). */
  written: Record<string, unknown>;
}

export interface IndexField {
  field: string;
  direction: 'asc' | 'desc';
}

export interface Index {
  name: string;
  fields: IndexField[];
  unique: boolean;
  /** Every index keyword besides name / properties / unique (contested, countable, timeRange, terminal, …). */
  options: Record<string, unknown>;
  /** The index as written. */
  written: Record<string, unknown>;
}

export interface Entity {
  /** Document type name. */
  name: string;
  fields: Field[];
  indices: Index[];
  /** Document-type keywords (documentsMutable, canBeDeleted, ttl, indexOnly, actionFees, …). */
  config: Record<string, unknown>;
  /** ownerRefersTo / creatorRefersTo. */
  typeReferences: Reference[];
  /** propertyConstraints: rule name -> condition. */
  propertyConstraints: Record<string, unknown>;
  description?: string;
  /** The document type schema as written. */
  schema: Record<string, unknown>;
}

export type Confidence = 'high' | 'medium' | 'low';

/** A node that is not a document type of this contract: a platform object or another contract's document type. */
export interface ExternalNode {
  /** Node id: 'platform:identity' | 'platform:contract' | 'platform:token' | 'platform:identityPublicKey' | 'external:<contractId>/<docType>'. */
  id: string;
  kind: 'identity' | 'contract' | 'token' | 'identityPublicKey' | 'externalDocument';
  label: string;
  contractId?: string;
  documentType?: string;
}

export interface Relationship {
  id: string;
  /** 'declared' comes from a refersTo in the contract; 'inferred' is a naming heuristic. */
  kind: 'declared' | 'inferred';
  /** Referencing entity (holds the field). */
  from: string;
  /** Referenced node: an entity name or an ExternalNode id. */
  to: string;
  /** Field path on `from` ('$ownerId' / '$creatorId' for a document type reference). */
  fromField: string;
  /** What is matched on `to`: '$id', a lookup index name, an inList path, a key, … */
  toField: string;
  confidence: Confidence;
  /** Human-readable explanation. */
  reason: string;
  // Declared edges only:
  site?: RefSite;
  target?: RefTarget;
  /** Position in an anyOf / allOf, when the edge is one operand of an expression. */
  expression?: { op: 'anyOf' | 'allOf'; branch: number; of: number };
  /** The field may be left out (so the reference is 0..1, not 1). */
  optional?: boolean;
}

export interface ContractModel {
  contractId?: string;
  ownerId?: string;
  version?: number;
  /** Contract-level config (keepsHistory, readonly, moderation, …) when available. */
  config?: Record<string, unknown>;
  /** Group definitions, keyed by group contract position, when present. */
  groups?: Record<string, unknown>;
  /** Token configurations, keyed by token position, when present. */
  tokens?: Record<string, unknown>;
  keywords?: string[];
  description?: string;
  /** Contract timestamps / heights (createdAt, updatedAt, …) when present. */
  times?: Record<string, number>;
  /** schemaDefs, for $ref resolution and display. */
  schemaDefs?: Record<string, unknown>;
  entities: Entity[];
  /** Platform objects and other contracts' document types that references point at. */
  externals: ExternalNode[];
  relationships: Relationship[];
}
