import { useState } from 'react';
import type { ContractModel, Entity } from '../model/types';
import { BOOK, contractSettingRows, documentTypeChips, moderationRows } from '../model/describe';

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

function Row({ label, value, href }: { label: string; value: string | number; href?: string }) {
  return (
    <div className="cv-meta-row">
      <span className="cv-meta-label">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )}
      </span>
      <span className="cv-meta-value">{value}</span>
    </div>
  );
}

function TypeSettings({ entity }: { entity: Entity }) {
  const chips = documentTypeChips(entity);
  return (
    <div className="cv-meta-type">
      <span className="cv-meta-type-name cv-mono">{entity.name}</span>
      <span className="cv-meta-chips">
        {chips.length ? (
          chips.map((ch) => (
            <span key={ch.text} className={`cv-chip cv-tone-${ch.tone}`} title={ch.detail}>
              {ch.text}
            </span>
          ))
        ) : (
          <span className="cv-muted">defaults</span>
        )}
      </span>
    </div>
  );
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  } catch {
    return String(ms);
  }
}

export function ContractMetaPanel({ model }: { model: ContractModel }) {
  const [open, setOpen] = useState(false);
  const declared = model.relationships.filter((r) => r.kind === 'declared').length;
  const inferred = model.relationships.length - declared;
  const settings = contractSettingRows(model.config);
  const moderation = moderationRows(model.config?.moderation);
  const t = model.times ?? {};

  return (
    <div className={`cv-metapanel ${open ? 'open' : ''}`}>
      <button type="button" className="cv-metapanel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Contract metadata</span>
        <span className="cv-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="cv-metapanel-body">
          {model.description && <p className="cv-meta-desc">{model.description}</p>}
          {model.contractId && <CopyRow label="contract id" value={model.contractId} />}
          {model.ownerId && <CopyRow label="owner id" value={model.ownerId} />}
          {model.version !== undefined && <Row label="version" value={model.version} />}
          {t.createdAt !== undefined && <Row label="created" value={formatTime(t.createdAt)} />}
          {t.updatedAt !== undefined && <Row label="updated" value={formatTime(t.updatedAt)} />}
          <Row label="document types" value={model.entities.length} />
          <Row label="references (declared)" value={declared} />
          <Row label="relationships (inferred)" value={inferred} />
          {model.groups && <Row label="groups" value={Object.keys(model.groups).length} />}
          {model.tokens && <Row label="tokens" value={Object.keys(model.tokens).length} />}
          {model.keywords && (
            <div className="cv-meta-row">
              <span className="cv-meta-label">keywords</span>
              <span className="cv-meta-chips">
                {model.keywords.map((k) => (
                  <span key={k} className="cv-chip cv-tone-neutral">
                    {k}
                  </span>
                ))}
              </span>
            </div>
          )}

          {settings.length > 0 && (
            <>
              <div className="cv-meta-subhead">config</div>
              {settings.map((r) => (
                <Row key={r.label} label={r.label} value={r.value} href={r.href} />
              ))}
            </>
          )}

          {moderation.length > 0 && (
            <>
              <div className="cv-meta-subhead">
                <a href={`${BOOK}contract-keywords/contract-config.html#moderation`} target="_blank" rel="noreferrer">
                  moderation
                </a>
              </div>
              {moderation.map((r) => (
                <Row key={r.label} label={r.label} value={r.value} />
              ))}
            </>
          )}

          {model.schemaDefs && (
            <>
              <div className="cv-meta-subhead">schemaDefs</div>
              {Object.entries(model.schemaDefs).map(([name, def]) => (
                <Row
                  key={name}
                  label={name}
                  value={
                    def && typeof def === 'object' && 'type' in def ? String((def as { type: unknown }).type) : 'definition'
                  }
                />
              ))}
            </>
          )}

          <div className="cv-meta-subhead">document types</div>
          {model.entities.map((e) => (
            <TypeSettings key={e.name} entity={e} />
          ))}
        </div>
      )}
    </div>
  );
}
