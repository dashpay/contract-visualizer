// Infer relationships between document types.
//
// Dash contracts have NO foreign keys, so every edge here is a heuristic guess
// and is surfaced to the user as `inferred` + editable. We never claim these
// are declared by the contract.

import type { ContractModel, Entity, Field, Relationship } from './types';

/** Normalise a name for fuzzy comparison: lowercase, strip a trailing plural 's'. */
function norm(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith('s') ? lower.slice(0, -1) : lower;
}

/** The single-field unique-index field of an entity, if any (its de-facto id). */
function uniqueKeyField(entity: Entity): string | undefined {
  const single = entity.indices.find((i) => i.unique && i.fields.length === 1);
  return single?.fields[0]?.field;
}

function findEntityByName(entities: Entity[], base: string): Entity | undefined {
  const target = norm(base);
  return entities.find((e) => norm(e.name) === target);
}

/** Strip a trailing Id/Ref suffix from a field name, e.g. authorId -> author. */
function stripIdSuffix(field: string): string | null {
  const m = field.match(/^(.*?)(Id|ID|Ref|ref)$/);
  return m && m[1] ? m[1] : null;
}

export function inferRelationships(model: ContractModel): Relationship[] {
  const { entities } = model;
  const out: Relationship[] = [];
  const seen = new Set<string>();

  const uniqueKeys = new Map<string, string>(); // entityName -> unique key field
  for (const e of entities) {
    const k = uniqueKeyField(e);
    if (k) uniqueKeys.set(e.name, k);
  }

  const add = (rel: Omit<Relationship, 'id'>) => {
    const id = `${rel.from}.${rel.fromField}->${rel.to}.${rel.toField}`;
    if (seen.has(id) || rel.from === rel.to) return;
    seen.add(id);
    out.push({ id, ...rel });
  };

  for (const from of entities) {
    for (const field of from.fields) {
      // (1) identifier-typed field named <x>Id/<x>Ref -> entity <x>
      const base = stripIdSuffix(field.name);
      if (base) {
        const target = findEntityByName(entities, base);
        if (target && target.name !== from.name) {
          const isId = field.type === 'identifier';
          add({
            from: from.name,
            to: target.name,
            fromField: field.name,
            toField: uniqueKeys.get(target.name) ?? '$id',
            confidence: isId ? 'high' : 'medium',
            reason: isId
              ? `${from.name}.${field.name} is an identifier named after ${target.name}`
              : `${from.name}.${field.name} is named after ${target.name}`,
          });
          continue;
        }
      }

      // (2) field name equals another entity's single-field unique key
      for (const [entityName, keyField] of uniqueKeys) {
        if (entityName === from.name) continue;
        if (field.name === keyField) {
          add({
            from: from.name,
            to: entityName,
            fromField: field.name,
            toField: keyField,
            confidence: 'high',
            reason: `${from.name}.${field.name} matches ${entityName}'s unique key "${keyField}"`,
          });
        }
      }
    }
  }

  // (3) weak: two entities share a non-unique indexed field name (and neither
  // edge already exists). Lower confidence, helps spot implicit links.
  const indexedFieldOwners = new Map<string, Set<string>>();
  for (const e of entities) {
    for (const f of e.fields) {
      if (!f.indexed) continue;
      if (!indexedFieldOwners.has(f.name)) indexedFieldOwners.set(f.name, new Set());
      indexedFieldOwners.get(f.name)!.add(e.name);
    }
  }
  for (const [fieldName, owners] of indexedFieldOwners) {
    if (owners.size < 2) continue;
    const list = [...owners];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const already = [...seen].some(
          (id) => id.includes(`${a}.${fieldName}`) || id.includes(`${b}.${fieldName}`),
        );
        if (already) continue;
        add({
          from: a,
          to: b,
          fromField: fieldName,
          toField: fieldName,
          confidence: 'low',
          reason: `${a} and ${b} both index "${fieldName}"`,
        });
      }
    }
  }

  return out;
}

/** Convenience: return a copy of the model with relationships filled in. */
export function withInferredRelationships(model: ContractModel): ContractModel {
  return { ...model, relationships: inferRelationships(model) };
}

/** Pull out the field objects an edge connects (for highlighting / details). */
export function relationshipFields(
  model: ContractModel,
  rel: Relationship,
): { fromField?: Field; toField?: Field } {
  const fromEntity = model.entities.find((e) => e.name === rel.from);
  const toEntity = model.entities.find((e) => e.name === rel.to);
  return {
    fromField: fromEntity?.fields.find((f) => f.name === rel.fromField),
    toField: toEntity?.fields.find((f) => f.name === rel.toField),
  };
}
