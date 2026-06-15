import { createContext, useContext } from 'react';
import type { Entity, Field, Index, Relationship } from '../model/types';

export type Selection =
  | { kind: 'entity'; entity: Entity }
  | { kind: 'field'; entity: Entity; field: Field }
  | { kind: 'index'; entity: Entity; index: Index }
  | { kind: 'relationship'; relationship: Relationship }
  | null;

/** Stable callback context so custom nodes can open the inspector without
 *  threading callbacks through node data (which would churn on every change). */
export const SelectionContext = createContext<(sel: Selection) => void>(() => {});

export function useSelect(): (sel: Selection) => void {
  return useContext(SelectionContext);
}
