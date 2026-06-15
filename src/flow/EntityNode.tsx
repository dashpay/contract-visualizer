import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EntityNodeData } from './diagramToFlow';
import { useSelect } from './selection';
import type { Field, Index } from '../model/types';

function FieldRow({ entity, field, view }: { entity: EntityNodeData['entity']; field: Field; view: string }) {
  const select = useSelect();
  const uniqueMark = field.unique;
  const meriseKey = view === 'merise' && uniqueMark;
  return (
    <button
      type="button"
      className={`cv-field ${field.system ? 'cv-system' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'field', entity, field });
      }}
    >
      <span className="cv-field-gutter">{field.required ? <span className="cv-req" title="required" /> : null}</span>
      <span className={`cv-field-name ${meriseKey ? 'cv-id-underline' : ''}`}>
        {field.name}
        {uniqueMark && view !== 'merise' ? <span className="cv-key" title="unique index">key</span> : null}
        {field.indexed && !field.unique ? <span className="cv-ix" title="indexed">ix</span> : null}
      </span>
      <span className="cv-field-type">{field.type}</span>
    </button>
  );
}

function IndexRow({ entity, index }: { entity: EntityNodeData['entity']; index: Index }) {
  const select = useSelect();
  const fields = index.fields.map((f) => `${f.field}${f.direction === 'desc' ? ' ↓' : ''}`).join(', ');
  return (
    <button
      type="button"
      className="cv-index"
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'index', entity, index });
      }}
    >
      <span className="cv-index-name">{index.name}</span>
      <span className="cv-index-fields">{fields}</span>
      {index.unique ? <span className="cv-uniq" title="unique">U</span> : null}
    </button>
  );
}

function EntityNodeImpl({ data }: NodeProps) {
  const { entity, view } = data as EntityNodeData;
  const select = useSelect();
  return (
    <div className="cv-entity">
      <Handle type="target" position={Position.Left} className="cv-handle" />
      <button
        type="button"
        className="cv-entity-head"
        onClick={(e) => {
          e.stopPropagation();
          select({ kind: 'entity', entity });
        }}
      >
        <span className="cv-entity-name">{entity.name}</span>
        {view !== 'merise' ? <span className="cv-stereotype">«document type»</span> : null}
      </button>

      <div className="cv-fields">
        {entity.fields.map((f) => (
          <FieldRow key={f.name} entity={entity} field={f} view={view} />
        ))}
      </div>

      {entity.indices.length > 0 && (
        <div className="cv-indexes">
          <div className="cv-indexes-head">indexes</div>
          {entity.indices.map((idx) => (
            <IndexRow key={idx.name} entity={entity} index={idx} />
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="cv-handle" />
    </div>
  );
}

export const EntityNode = memo(EntityNodeImpl);
