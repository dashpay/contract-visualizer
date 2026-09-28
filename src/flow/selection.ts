import { createContext, useContext } from 'react';
import type { Entity, ExternalNode, Field, Index, Relationship } from '../model/types';

export type Selection =
  | { kind: 'entity'; entity: Entity }
  | { kind: 'field'; entity: Entity; field: Field }
  | { kind: 'index'; entity: Entity; index: Index }
  | { kind: 'constraint'; entity: Entity; name: string; rule: unknown }
  | { kind: 'relationship'; relationship: Relationship }
  | { kind: 'external'; node: ExternalNode }
  | null;

/** Stable callback context so custom nodes can open the inspector without
 *  threading callbacks through node data (which would churn on every change). */
export const SelectionContext = createContext<(sel: Selection) => void>(() => {});

export function useSelect(): (sel: Selection) => void {
  return useContext(SelectionContext);
}
