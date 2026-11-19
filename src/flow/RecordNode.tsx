import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { RecordNodeData } from './diagramToFlow';
import { useSelect } from './selection';
import { formatDuration } from '../model/describe';
import { RESTORE_WINDOW_SECONDS, type RecordField } from '../model/moderation';

function RecordRow({ field, label, onOpen }: { field: RecordField; label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`cv-field cv-record-field ${field.kept ? 'cv-record-kept' : ''}`}
      title={field.detail}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <span className="cv-field-gutter">{field.optional ? null : <span className="cv-req" title="always present" />}</span>
      <span className="cv-field-name">
        <span className="cv-field-label">{label}</span>
      </span>
      <span className="cv-field-type">{field.type}</span>
      <span />
    </button>
  );
}

/** The removal record a moderator's deletion of a document of this type leaves under the contract: a shadow of the document. */
function RecordNodeImpl({ data }: NodeProps) {
  const d = data as RecordNodeData;
  const select = useSelect();
  const open = () => select({ kind: 'record', entity: d.entity, moderation: d.moderation, fields: d.fields, referrers: d.referrers });
  return (
    <div className="cv-record">
      <Handle type="target" position={Position.Left} id="in" className="cv-handle cv-handle-moderation" />
      <button
        type="button"
        className="cv-record-head"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      >
        <span className="cv-record-name">{d.entity.name} · removal record</span>
        <span className="cv-stereotype">«shadow record»</span>
      </button>
      <div className="cv-record-note">
        written when a moderator deletes a {d.entity.name}; never deleted · restorable {formatDuration(RESTORE_WINDOW_SECONDS)}
        {d.moderation.settled ? ' (not a settled deletion)' : ''}
      </div>
      <div className="cv-fields">
        {d.fields.filter((f) => !f.kept).map((f) => (
          <RecordRow key={f.name} field={f} label={f.name} onOpen={open} />
        ))}
      </div>
      {d.fields.some((f) => f.kept) && (
        <div className="cv-fields cv-record-kept-group">
          <div className="cv-section-head cv-record-kept-head" title="moderatorAbilities.deleteKeepsFields: copied from the document at the deletion, public after it is gone">
            keptFields · copied from the {d.entity.name}
          </div>
          {d.fields.filter((f) => f.kept).map((f) => (
            <RecordRow key={f.name} field={f} label={f.name.slice('keptFields.'.length)} onOpen={open} />
          ))}
        </div>
      )}
      {d.referrers.length > 0 && (
        <div className="cv-record-note cv-record-referrers" title="A moderatedDocument reference resolves to the record once the document is removed">
          read by {d.referrers.join(', ')} once removed
        </div>
      )}
    </div>
  );
}

export const RecordNode = memo(RecordNodeImpl);
