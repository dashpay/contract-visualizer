// Relationships between document types.
//
// Since protocol version 14 a contract can DECLARE what an identifier points
// at (refersTo, ownerRefersTo, creatorRefersTo); those edges are read from the
// schema and shown as authoritative (references.ts). Properties without a
// declaration still get the naming heuristics below, surfaced as `inferred`
// and hideable: we never claim the contract states them.

import { declaredFieldPaths, declaredRelationships } from './references';
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
  // entity -> field paths an edge already starts from (declared or inferred)
  const covered = new Map<string, Set<string>>();
  for (const e of entities) covered.set(e.name, declaredFieldPaths(e));

  const uniqueKeys = new Map<string, string>(); // entityName -> unique key field
  for (const e of entities) {
    const k = uniqueKeyField(e);
    if (k) uniqueKeys.set(e.name, k);
  }

  const add = (rel: Omit<Relationship, 'id' | 'kind'>) => {
    const id = `inf:${rel.from}.${rel.fromField}->${rel.to}.${rel.toField}`;
    if (seen.has(id) || rel.from === rel.to) return;
    seen.add(id);
    covered.get(rel.from)?.add(rel.fromField);
    out.push({ id, kind: 'inferred', ...rel });
  };

  for (const from of entities) {
    const declared = declaredFieldPaths(from);
    for (const field of from.fields) {
      if (declared.has(field.path) || field.system) continue;

      // (1) field named <x>Id/<x>Ref -> entity <x>
      const base = stripIdSuffix(field.name);
      if (base) {
        const target = findEntityByName(entities, base);
        if (target && target.name !== from.name) {
          const isId = field.type === 'identifier';
          add({
            from: from.name,
            to: target.name,
            fromField: field.path,
            toField: uniqueKeys.get(target.name) ?? '$id',
            confidence: isId ? 'high' : 'medium',
            reason: isId
              ? `${from.name}.${field.path} is an identifier named after ${target.name}, but declares no refersTo`
              : `${from.name}.${field.path} is named after ${target.name}`,
          });
          continue;
        }
      }

      // (2) field name equals another entity's single-field unique key
      for (const [entityName, keyField] of uniqueKeys) {
        if (entityName === from.name || keyField.startsWith('$')) continue;
        if (field.path === keyField) {
          add({
            from: from.name,
            to: entityName,
            fromField: field.path,
            toField: keyField,
            confidence: 'high',
            reason: `${from.name}.${field.path} matches ${entityName}'s unique key "${keyField}"`,
          });
        }
      }
    }
  }

  // (3) weak: two entities index the same user field name that no edge covers
  // yet. System fields ($ownerId, $createdAt) are indexed everywhere and say
  // nothing about a link, so they are left out.
  const indexedFieldOwners = new Map<string, string[]>();
  for (const e of entities) {
    for (const f of e.fields) {
      if (!f.indexed || f.system || f.reference) continue;
      if (!indexedFieldOwners.has(f.path)) indexedFieldOwners.set(f.path, []);
      indexedFieldOwners.get(f.path)!.push(e.name);
    }
  }
  for (const [fieldName, owners] of indexedFieldOwners) {
    if (owners.length < 2) continue;
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const a = owners[i];
        const b = owners[j];
        if (covered.get(a)?.has(fieldName) || covered.get(b)?.has(fieldName)) continue;
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

/** Return a copy of the model with declared and inferred relationships filled in. */
export function withRelationships(model: ContractModel): ContractModel {
  const { relationships: declared, externals } = declaredRelationships(model);
  return { ...model, externals, relationships: [...declared, ...inferRelationships(model)] };
}

/** Pull out the field objects an edge connects (for highlighting / details). */
export function relationshipFields(
  model: ContractModel,
  rel: Relationship,
): { fromField?: Field; toField?: Field } {
  const fromEntity = model.entities.find((e) => e.name === rel.from);
  const toEntity = model.entities.find((e) => e.name === rel.to);
  return {
    fromField: fromEntity?.fields.find((f) => f.path === rel.fromField),
    toField: toEntity?.fields.find((f) => f.path === rel.toField),
  };
}
