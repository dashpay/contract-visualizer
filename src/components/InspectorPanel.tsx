import type { Selection } from '../flow/selection';
import type { ContractModel } from '../model/types';
import { relationshipFields } from '../model/relationships';

interface Props {
  selection: Selection;
  model: ContractModel;
  hiddenEdges: Set<string>;
  onToggleEdge: (id: string) => void;
  onClose: () => void;
}

function Constraints({ c }: { c: Record<string, unknown> }) {
  const entries = Object.entries(c);
  if (entries.length === 0) return null;
  return (
    <dl className="cv-constraints">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="cv-mono">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InspectorPanel({ selection, model, hiddenEdges, onToggleEdge, onClose }: Props) {
  if (!selection) return null;

  return (
    <aside className="cv-inspector" aria-label="Details">
      <button type="button" className="cv-inspector-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      {selection.kind === 'entity' && (
        <>
          <h2>{selection.entity.name}</h2>
          <p className="cv-muted">document type · {selection.entity.fields.length} fields · {selection.entity.indices.length} indexes</p>
          <dl className="cv-constraints">
            {Object.entries(selection.entity.config).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className="cv-mono">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {selection.kind === 'field' && (
        <>
          <h2 className="cv-mono">{selection.field.name}</h2>
          <p className="cv-muted">
            {selection.entity.name} · {selection.field.type}
            {selection.field.required ? ' · required' : ''}
            {selection.field.unique ? ' · unique' : selection.field.indexed ? ' · indexed' : ''}
            {selection.field.system ? ' · system' : ''}
          </p>
          {selection.field.description && <p>{selection.field.description}</p>}
          <Constraints c={selection.field.constraints} />
        </>
      )}

      {selection.kind === 'index' && (
        <>
          <h2 className="cv-mono">{selection.index.name}</h2>
          <p className="cv-muted">
            {selection.entity.name} · index{selection.index.unique ? ' · unique' : ''}
          </p>
          <ol className="cv-index-detail">
            {selection.index.fields.map((f) => (
              <li key={f.field} className="cv-mono">
                {f.field} <span className="cv-muted">{f.direction}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {selection.kind === 'relationship' && (
        <>
          <h2>relationship</h2>
          <p className="cv-mono">
            {selection.relationship.from}.{selection.relationship.fromField} → {selection.relationship.to}.
            {selection.relationship.toField}
          </p>
          <p className="cv-muted">
            inferred · {selection.relationship.confidence} confidence
          </p>
          <p>{selection.relationship.reason}</p>
          {(() => {
            const { fromField } = relationshipFields(model, selection.relationship);
            return fromField ? (
              <p className="cv-muted cv-mono">{fromField.name} : {fromField.type}</p>
            ) : null;
          })()}
          <button type="button" className="cv-primary" onClick={() => onToggleEdge(selection.relationship.id)}>
            {hiddenEdges.has(selection.relationship.id) ? 'Show this edge' : 'Hide this edge'}
          </button>
        </>
      )}
    </aside>
  );
}
