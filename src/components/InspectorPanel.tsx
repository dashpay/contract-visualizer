import type { ReactNode } from 'react';
import { key2, type Change, type ContractDiff } from '../model/diff';
import { ChangeBody } from './ChangesPanel';
import { JsonView } from './JsonView';
import type { Selection } from '../flow/selection';
import type { ContractModel, Entity, Field, RefExpr, RefTarget, Reference, Relationship } from '../model/types';
import { relationshipFields } from '../model/relationships';
import { writtenProperty } from '../model/introspect';
import { describeTarget } from '../model/references';
import { constraintPaths, renderCondition } from '../model/constraints';
import {
  BOOK,
  documentTypeChips,
  fieldChips,
  formatDuration,
  indexChips,
  refHref,
  type Chip,
} from '../model/describe';

interface Props {
  selection: Selection;
  model: ContractModel;
  hiddenEdges: Set<string>;
  onToggleEdge: (id: string) => void;
  onOpenContract: (contractId: string) => void;
  onClose: () => void;
  /** Compare mode: show the change behind the selected element. */
  diff?: ContractDiff;
  /** Open the GroveDB layout panel for a document type. */
  onShowLayout?: (documentType: string) => void;
}

function changeFor(diff: ContractDiff | undefined, selection: Selection): Change | undefined {
  if (!diff || !selection) return undefined;
  const id =
    selection.kind === 'field'
      ? `field:${selection.entity.name}:${selection.field.path}`
      : selection.kind === 'index'
        ? `index:${selection.entity.name}:${selection.index.name}`
        : selection.kind === 'constraint'
          ? `rule:${selection.entity.name}:${selection.name}`
          : selection.kind === 'entity'
            ? `type:${selection.entity.name}`
            : undefined;
  return id ? diff.changes.find((c) => c.id === id) : undefined;
}

const KIND_LABEL = { added: 'added in head', removed: 'removed in head', changed: 'changed' } as const;

/**
 * In compare mode, which version's JSON the inspector shows: the head's,
 * or the base's for what the head removed.
 */
function jsonVersion(diff: ContractDiff | undefined, selection: Selection): string | undefined {
  if (!diff || !selection) return undefined;
  const entity = 'entity' in selection ? selection.entity.name : undefined;
  const removed =
    (entity !== undefined && diff.status.entities[entity] === 'removed') ||
    (selection.kind === 'field' && diff.status.fields[key2(selection.entity.name, selection.field.path)] === 'removed') ||
    (selection.kind === 'index' && diff.status.indices[key2(selection.entity.name, selection.index.name)] === 'removed');
  return removed ? 'as in base' : 'as in head';
}

function ChangeSection({ change }: { change: Change }) {
  return (
    <div className={`cv-inspector-change cv-change-${change.kind}`}>
      <div className="cv-inspector-sub">change: {KIND_LABEL[change.kind]}</div>
      <ChangeBody change={change} />
    </div>
  );
}

function Value({ v }: { v: unknown }) {
  if (Array.isArray(v)) return <>{v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ')}</>;
  if (v !== null && typeof v === 'object') return <>{JSON.stringify(v)}</>;
  return <>{String(v)}</>;
}

function Constraints({ c }: { c: Record<string, unknown> | undefined }) {
  const entries = Object.entries(c ?? {});
  if (entries.length === 0) return null;
  return (
    <dl className="cv-constraints">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd className="cv-mono">
            <Value v={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ChipList({ chips }: { chips: Chip[] }) {
  if (!chips.length) return null;
  return (
    <ul className="cv-explain">
      {chips.map((c) => (
        <li key={c.text}>
          <span className={`cv-chip cv-tone-${c.tone}`}>{c.text}</span> {c.detail}{' '}
          {c.href && (
            <a href={c.href} target="_blank" rel="noreferrer" className="cv-book">
              book ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="cv-inspector-sub">{title}</div>
      {children}
    </>
  );
}

function TargetDetails({ t }: { t: RefTarget }) {
  const rows: Array<[string, ReactNode]> = [];
  if (t.contractId) rows.push(['contract', <span className="cv-mono cv-break">{t.contractId}</span>]);
  if (t.lookup) {
    rows.push([
      'lookup',
      <>
        unique index <code>{t.lookup.index}</code>, key{' '}
        {Object.entries(t.lookup.keys)
          .map(([k, v]) => `${k} ← ${v === '.' ? 'this value' : v}`)
          .join(', ')}
      </>,
    ]);
  }
  if (t.propertyAgreement) {
    rows.push([
      'must agree',
      <>
        {Object.entries(t.propertyAgreement)
          .map(([here, there]) => `${here} (here) = ${there} (there)`)
          .join('; ')}
      </>,
    ]);
  }
  if (t.keyIdProperty) rows.push(['key id in', <code>{t.keyIdProperty}</code>]);
  if (t.identityProperty) rows.push(['key of', <code>{t.identityProperty}</code>]);
  if (t.keyRequirements?.purpose) rows.push(['key purpose', t.keyRequirements.purpose]);
  if (t.keyRequirements?.boundTo) rows.push(['key bound to', <code>{t.keyRequirements.boundTo}</code>]);
  if (t.contractRequirements) {
    for (const [k, v] of Object.entries(t.contractRequirements)) {
      rows.push([k, typeof v === 'number' && /Seconds/.test(k) ? formatDuration(v) : String(v)]);
    }
  }
  if (!rows.length) return null;
  return (
    <dl className="cv-constraints">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExprView({ expr, depth = 0 }: { expr: RefExpr; depth?: number }) {
  if (expr.op === 'target') {
    return (
      <div className="cv-ref-target" style={{ marginLeft: depth * 10 }}>
        <p>
          <code>{expr.target.type}</code>: {describeTarget(expr.target)}.{' '}
          <a href={refHref(expr.target)} target="_blank" rel="noreferrer" className="cv-book">
            book ↗
          </a>
        </p>
        <TargetDetails t={expr.target} />
      </div>
    );
  }
  return (
    <div className="cv-ref-expr" style={{ marginLeft: depth * 10 }}>
      <p className="cv-muted">
        <code>{expr.op}</code>: {expr.op === 'anyOf' ? 'at least one of these holds' : 'every one of these holds'}{' '}
        <a href={`${BOOK}contract-keywords/refers-to-expressions.html`} target="_blank" rel="noreferrer" className="cv-book">
          book ↗
        </a>
      </p>
      {expr.operands.map((o, i) => (
        <ExprView key={i} expr={o} depth={depth + 1} />
      ))}
    </div>
  );
}

function ReferenceView({ reference }: { reference: Reference }) {
  const where =
    reference.site === 'owner'
      ? 'The identity writing a document (its owner) must meet this reference.'
      : reference.site === 'creator'
        ? 'The identity creating a document must meet this reference; later owners need not.'
        : reference.site === 'element'
          ? 'Every element of this typed array must meet this reference.'
          : 'The value must meet this reference when a document is written.';
  return (
    <Section title={reference.site === 'owner' ? 'ownerRefersTo' : reference.site === 'creator' ? 'creatorRefersTo' : 'refersTo'}>
      <p className="cv-muted">{where}</p>
      <ExprView expr={reference.expr} />
      <details className="cv-raw">
        <summary>declaration</summary>
        <pre className="cv-mono">{JSON.stringify(reference.raw, null, 2)}</pre>
      </details>
    </Section>
  );
}

function FieldView({ entity, field, version }: { entity: Entity; field: Field; version?: string }) {
  // A property the head removed is not in the merged type's (head) schema:
  // show it as the base wrote it, without an object's members.
  const json = writtenProperty(entity.schema, field.path) ?? (field.system ? undefined : field.written);
  const e = field.encryptedFor;
  return (
    <>
      <h2 className="cv-mono">{field.path}</h2>
      <p className="cv-muted">
        {entity.name} · {field.ref ? `${field.ref} (${field.type})` : field.type}
        {field.required ? ' · required' : ' · optional'}
        {field.unique ? ' · unique' : field.indexed ? ' · indexed' : ''}
        {field.system ? ' · system' : ''}
      </p>
      {field.description && <p>{field.description}</p>}
      <ChipList chips={fieldChips(field)} />
      {field.reference && <ReferenceView reference={field.reference} />}
      {e && (
        <Section title="encryptedFor">
          <p className="cv-muted">
            Ciphertext for the identity in <code>{e.recipient}</code>
            {e.recipientKey ? (
              <>
                , to its key <code>{e.recipientKey}</code>
              </>
            ) : null}
            {e.senderKey ? (
              <>
                , from the writer's key <code>{e.senderKey}</code>
              </>
            ) : null}
            {e.scheme ? <>, scheme {e.scheme}</> : null}.{' '}
            <a href={`${BOOK}contract-keywords/encrypted-for.html`} target="_blank" rel="noreferrer" className="cv-book">
              book ↗
            </a>
          </p>
        </Section>
      )}
      {Object.keys(field.constraints).length > 0 && (
        <Section title="constraints">
          <Constraints c={field.constraints} />
        </Section>
      )}
      {field.items && Object.keys(field.items).length > 0 && (
        <Section title="each element (items)">
          <Constraints c={field.items} />
        </Section>
      )}
      {json && <JsonView value={json} title="JSON of the property" note={version} />}
    </>
  );
}

function EntityView({
  entity,
  model,
  onShowLayout,
  version,
}: {
  entity: Entity;
  model: ContractModel;
  onShowLayout?: (documentType: string) => void;
  version?: string;
}) {
  const chips = documentTypeChips(entity);
  const shown = new Set(['ttl', 'indexOnly', 'documentsMutable', 'canBeDeleted', 'canBeDeletedByModerators', 'canBeDeletedByModeratorsFor', 'creationRestrictionMode', 'transferable', 'tradeMode', 'documentsKeepHistory', 'keepsTransferHistory', 'keepsPurchaseHistory', 'keepsPricingHistory', 'actionFees', 'tokenCost', 'documentsCountable', 'documentsSummable', 'documentsAverageable', 'rangeCountable', 'rangeSummable', 'rangeAverageable', 'signatureSecurityLevelRequirement', 'requiresIdentityEncryptionBoundedKey', 'requiresIdentityDecryptionBoundedKey']);
  const rest = Object.fromEntries(Object.entries(entity.config).filter(([k]) => !shown.has(k)));
  const outgoing = model.relationships.filter((r) => r.from === entity.name && r.kind === 'declared').length;
  const incoming = model.relationships.filter((r) => r.to === entity.name && r.kind === 'declared').length;
  return (
    <>
      <h2>{entity.name}</h2>
      <p className="cv-muted">
        {entity.config.indexOnly === true ? 'index-only document type' : 'document type'} · {entity.fields.length} fields ·{' '}
        {entity.indices.length} indexes · {outgoing} references out · {incoming} in
      </p>
      {entity.description && <p>{entity.description}</p>}
      {onShowLayout && (
        <button type="button" className="cv-primary cv-layout-button" onClick={() => onShowLayout(entity.name)}>
          GroveDB layout
        </button>
      )}
      <ChipList chips={chips} />
      {entity.typeReferences.map((r) => (
        <ReferenceView key={r.path} reference={r} />
      ))}
      {Object.keys(rest).length > 0 && (
        <Section title="other settings">
          <Constraints c={rest} />
        </Section>
      )}
      <JsonView value={entity.schema} title="JSON of the document type" note={version} />
    </>
  );
}

function RelationshipView({
  rel,
  model,
  hidden,
  onToggle,
}: {
  rel: Relationship;
  model: ContractModel;
  hidden: boolean;
  onToggle: () => void;
}) {
  const { fromField } = relationshipFields(model, rel);
  const target = model.entities.find((e) => e.name === rel.to)?.name ?? model.externals.find((n) => n.id === rel.to)?.label ?? rel.to;
  return (
    <>
      <h2>{rel.kind === 'declared' ? 'reference' : 'inferred relationship'}</h2>
      <p className="cv-mono">
        {rel.from}.{rel.fromField} → {target}
        {rel.toField !== '$id' ? ` (${rel.toField})` : ''}
      </p>
      <p className="cv-muted">
        {rel.kind === 'declared'
          ? 'declared in the contract · checked by the platform when a document is written'
          : `inferred from names · ${rel.confidence} confidence · not stated by the contract`}
      </p>
      <p>{rel.reason}.</p>
      {rel.target && <TargetDetails t={rel.target} />}
      {fromField && (
        <p className="cv-muted cv-mono">
          {fromField.path} : {fromField.type}
          {fromField.required ? '' : ' (optional)'}
        </p>
      )}
      <button type="button" className="cv-primary" onClick={onToggle}>
        {hidden ? 'Show this edge' : 'Hide this edge'}
      </button>
    </>
  );
}

export function InspectorPanel({ selection, model, hiddenEdges, onToggleEdge, onOpenContract, onClose, diff, onShowLayout }: Props) {
  if (!selection) return null;
  const change = changeFor(diff, selection);
  const version = jsonVersion(diff, selection);

  return (
    <aside className="cv-inspector" aria-label="Details">
      <button type="button" className="cv-inspector-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      {change && <ChangeSection change={change} />}

      {selection.kind === 'entity' && (
        <EntityView entity={selection.entity} model={model} onShowLayout={onShowLayout} version={version} />
      )}

      {selection.kind === 'field' && <FieldView entity={selection.entity} field={selection.field} version={version} />}

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
          <ChipList chips={indexChips(selection.index)} />
          {Object.keys(selection.index.options).length > 0 && (
            <Section title="index keywords">
              <Constraints c={selection.index.options} />
            </Section>
          )}
          <JsonView value={selection.index.written} title="JSON of the index" note={version} />
        </>
      )}

      {selection.kind === 'constraint' && (
        <>
          <h2 className="cv-mono">{selection.name}</h2>
          <p className="cv-muted">{selection.entity.name} · property constraint</p>
          <p className="cv-formula cv-mono">{renderCondition(selection.rule)}</p>
          <p className="cv-muted">
            Every created or replaced document must satisfy this rule. It reads{' '}
            {constraintPaths(selection.rule).map((p, i) => (
              <span key={p}>
                {i ? ', ' : ''}
                <code>{p}</code>
              </span>
            ))}
            .{' '}
            <a href={`${BOOK}contract-keywords/property-constraints.html`} target="_blank" rel="noreferrer" className="cv-book">
              book ↗
            </a>
          </p>
          <details className="cv-raw">
            <summary>rule</summary>
            <pre className="cv-mono">{JSON.stringify(selection.rule, null, 2)}</pre>
          </details>
        </>
      )}

      {selection.kind === 'relationship' && (
        <RelationshipView
          rel={selection.relationship}
          model={model}
          hidden={hiddenEdges.has(selection.relationship.id)}
          onToggle={() => onToggleEdge(selection.relationship.id)}
        />
      )}

      {selection.kind === 'external' && (
        <>
          <h2>{selection.node.label}</h2>
          <p className="cv-muted">
            {selection.node.kind === 'externalDocument' ? 'a document type of another contract' : 'a platform object'}
          </p>
          {selection.node.contractId && <p className="cv-mono cv-break">{selection.node.contractId}</p>}
          <div className="cv-inspector-sub">referenced by</div>
          <ul className="cv-explain">
            {model.relationships
              .filter((r) => r.to === selection.node.id)
              .map((r) => (
                <li key={r.id} className="cv-mono">
                  {r.from}.{r.fromField}
                  {r.target?.keyRequirements?.purpose ? ` (${r.target.keyRequirements.purpose} key)` : ''}
                </li>
              ))}
          </ul>
          {selection.node.contractId && selection.node.contractId !== '?' && (
            <button type="button" className="cv-primary" onClick={() => onOpenContract(selection.node.contractId!)}>
              Open this contract
            </button>
          )}
        </>
      )}
    </aside>
  );
}
