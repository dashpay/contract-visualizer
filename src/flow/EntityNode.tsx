import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { EntityNodeData } from './diagramToFlow';
import { kindColor } from './diagramToFlow';
import { useSelect } from './selection';
import { documentTypeChips, fieldChips, indexChips, type Chip } from '../model/describe';
import { renderCondition } from '../model/constraints';
import type { Entity, Field, Index } from '../model/types';
import type { ChangeKind } from '../model/diff';

const MARK: Record<ChangeKind, string> = { added: '+', removed: '−', changed: '~' };

/** Row class and gutter mark for a part's compare status. */
function statusProps(status: ChangeKind | undefined, refused: boolean) {
  return {
    className: `${status ? `cv-row-${status}` : ''} ${refused ? 'cv-row-refused' : ''}`,
    mark: status ? MARK[status] : undefined,
  };
}

function RefusedMark({ show }: { show: boolean }) {
  return show ? (
    <span className="cv-refused-mark" title="A contract update with this change would be refused">
      ✕
    </span>
  ) : null;
}

function Chips({ chips, className = '' }: { chips: Chip[]; className?: string }) {
  if (!chips.length) return null;
  return (
    <span className={`cv-chips ${className}`}>
      {chips.map((c) => (
        <span key={c.text} className={`cv-chip cv-tone-${c.tone}`} title={c.detail}>
          {c.text}
        </span>
      ))}
    </span>
  );
}

function FieldRow({
  entity,
  field,
  data,
}: {
  entity: Entity;
  field: Field;
  data: EntityNodeData;
}) {
  const select = useSelect();
  const meriseKey = data.view === 'merise' && field.unique;
  const isSource = data.sources.includes(field.path);
  const isTarget = data.targets.includes(field.path);
  const kind = data.refKinds[field.path];
  const refused = !!data.diff?.refused.includes(`field:${field.path}`);
  const st = statusProps(data.diff?.fields[field.path], refused);
  return (
    <button
      type="button"
      className={`cv-field ${field.system ? 'cv-system' : ''} ${field.transient ? 'cv-transient' : ''} ${st.className}`}
      style={field.depth ? { paddingLeft: 10 + field.depth * 14 } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'field', entity, field });
      }}
    >
      {isTarget && <Handle type="target" position={Position.Left} id={`in:${field.path}`} className="cv-handle cv-handle-field" />}
      <span className="cv-field-gutter">
        {st.mark ? <span className="cv-diff-mark">{st.mark}</span> : field.required ? <span className="cv-req" title="required" /> : null}
      </span>
      <span className={`cv-field-name ${meriseKey ? 'cv-id-underline' : ''}`}>
        <span className="cv-field-label">
          {field.depth ? <span className="cv-muted">└ </span> : null}
          {field.name}
        </span>
        {field.unique && data.view !== 'merise' ? <span className="cv-key" title="in a unique index">key</span> : null}
        {field.indexed && !field.unique ? <span className="cv-ix" title="indexed">ix</span> : null}
        <Chips chips={fieldChips(field)} className="cv-chips-inline" />
        <RefusedMark show={refused} />
      </span>
      <span className="cv-field-type" title={field.ref ? `$ref #/$defs/${field.ref}` : undefined}>
        {field.ref ?? field.type}
      </span>
      <span className="cv-field-ref">
        {kind ? (
          <span className="cv-ref-arrow" style={{ color: kindColor(kind) }} title="declares a reference (refersTo)">
            →
          </span>
        ) : null}
      </span>
      {isSource && (
        <Handle
          type="source"
          position={Position.Right}
          id={`out:${field.path}`}
          className="cv-handle cv-handle-field"
          style={kind ? { background: kindColor(kind) } : undefined}
        />
      )}
    </button>
  );
}

function IndexRow({ entity, index, data }: { entity: Entity; index: Index; data: EntityNodeData }) {
  const select = useSelect();
  const fields = index.fields.map((f) => `${f.field}${f.direction === 'desc' ? ' ↓' : ''}`).join(', ');
  const chips = indexChips(index);
  const refused = !!data.diff?.refused.includes(`index:${index.name}`);
  const st = statusProps(data.diff?.indices[index.name], refused);
  return (
    <button
      type="button"
      className={`cv-index ${st.className}`}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'index', entity, index });
      }}
    >
      <span className="cv-index-line">
        {st.mark ? <span className="cv-diff-mark">{st.mark}</span> : null}
        <span className="cv-index-name">{index.name}</span>
        <span className="cv-index-fields">{fields || '(flat)'}</span>
        {index.unique ? <span className="cv-uniq" title="unique">U</span> : null}
        <RefusedMark show={refused} />
      </span>
      <Chips chips={chips} className="cv-chips-index" />
    </button>
  );
}

function EntityNodeImpl({ data }: NodeProps) {
  const d = data as EntityNodeData;
  const { entity, view } = d;
  const select = useSelect();
  const typeChips = documentTypeChips(entity);
  const constraints = Object.entries(entity.propertyConstraints);
  const indexOnly = entity.config.indexOnly === true;
  const typeStatus = d.diff?.status;
  const typeRefused = !!d.diff?.refused.includes('type');
  return (
    <div
      className={`cv-entity ${indexOnly ? 'cv-entity-indexonly' : ''} ${typeStatus ? `cv-entity-${typeStatus}` : ''} ${d.diff && !typeStatus ? 'cv-entity-unchanged' : ''}`}
    >
      <Handle type="target" position={Position.Left} id="in" className="cv-handle" />
      <button
        type="button"
        className="cv-entity-head"
        onClick={(e) => {
          e.stopPropagation();
          select({ kind: 'entity', entity });
        }}
      >
        <span className="cv-entity-name">
          {typeStatus ? <span className="cv-diff-mark">{MARK[typeStatus]}</span> : null}
          {entity.name}
          <RefusedMark show={typeRefused} />
        </span>
        {view !== 'merise' ? (
          <span className="cv-stereotype">{indexOnly ? '«index-only type»' : '«document type»'}</span>
        ) : null}
      </button>
      {typeChips.length > 0 && (
        <div className="cv-entity-chips">
          <Chips chips={typeChips} />
        </div>
      )}

      <div className="cv-fields">
        {entity.fields.map((f) => (
          <FieldRow key={f.path} entity={entity} field={f} data={d} />
        ))}
      </div>

      {entity.indices.length > 0 && (
        <div className="cv-indexes">
          <div className="cv-section-head">indexes</div>
          {entity.indices.map((idx) => (
            <IndexRow key={idx.name} entity={entity} index={idx} data={d} />
          ))}
        </div>
      )}

      {constraints.length > 0 && (
        <div className="cv-rules">
          <div className="cv-section-head">property constraints</div>
          {constraints.map(([name, rule]) => {
            const refused = !!d.diff?.refused.includes(`rule:${name}`);
            const st = statusProps(d.diff?.rules[name], refused);
            return (
            <button
              key={name}
              type="button"
              className={`cv-rule ${st.className}`}
              onClick={(e) => {
                e.stopPropagation();
                select({ kind: 'constraint', entity, name, rule });
              }}
            >
              <span className="cv-rule-name">
                {st.mark ? <span className="cv-diff-mark">{st.mark}</span> : null}
                {name}
                <RefusedMark show={refused} />
              </span>
              <span className="cv-rule-text cv-mono">{renderCondition(rule)}</span>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const EntityNode = memo(EntityNodeImpl);
