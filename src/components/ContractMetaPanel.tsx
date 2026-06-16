import { useState } from 'react';
import type { ContractModel, Entity } from '../model/types';

const RESTRICTION: Record<string, string> = {
  '0': 'creation: anyone',
  '1': 'creation: owner only',
  '2': 'creation: no one',
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="cv-meta-row">
      <span className="cv-meta-label">{label}</span>
      <button
        type="button"
        className="cv-meta-copy cv-mono"
        title="Copy"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? 'copied' : value}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cv-meta-row">
      <span className="cv-meta-label">{label}</span>
      <span className="cv-meta-value">{value}</span>
    </div>
  );
}

function TypeSettings({ entity }: { entity: Entity }) {
  const c = entity.config;
  const chips: string[] = [];
  if ('documentsMutable' in c) chips.push(c.documentsMutable ? 'mutable' : 'immutable');
  if ('canBeDeleted' in c) chips.push(c.canBeDeleted ? 'deletable' : 'non-deletable');
  if ('documentsKeepHistory' in c && c.documentsKeepHistory) chips.push('keeps history');
  if ('creationRestrictionMode' in c) {
    chips.push(RESTRICTION[String(c.creationRestrictionMode)] ?? `creation: ${String(c.creationRestrictionMode)}`);
  }
  return (
    <div className="cv-meta-type">
      <span className="cv-meta-type-name cv-mono">{entity.name}</span>
      <span className="cv-meta-chips">
        {chips.length ? chips.map((ch) => <span key={ch} className="cv-meta-chip">{ch}</span>) : <span className="cv-muted">—</span>}
      </span>
    </div>
  );
}

export function ContractMetaPanel({ model }: { model: ContractModel }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`cv-metapanel ${open ? 'open' : ''}`}>
      <button type="button" className="cv-metapanel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Contract metadata</span>
        <span className="cv-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="cv-metapanel-body">
          {model.contractId && <CopyRow label="contract id" value={model.contractId} />}
          {model.ownerId && <CopyRow label="owner id" value={model.ownerId} />}
          {model.version !== undefined && <Row label="version" value={model.version} />}
          <Row label="document types" value={model.entities.length} />
          <Row label="relationships" value={model.relationships.length} />
          {model.groups && <Row label="groups" value={Object.keys(model.groups).length} />}
          {model.tokens && <Row label="tokens" value={Object.keys(model.tokens).length} />}

          {model.config && Object.keys(model.config).length > 0 && (
            <>
              <div className="cv-meta-subhead">config</div>
              {Object.entries(model.config).map(([k, v]) => (
                <Row key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
              ))}
            </>
          )}

          <div className="cv-meta-subhead">document type settings</div>
          {model.entities.map((e) => (
            <TypeSettings key={e.name} entity={e} />
          ))}
        </div>
      )}
    </div>
  );
}
