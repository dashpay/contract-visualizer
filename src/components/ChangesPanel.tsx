import { useMemo, useState } from 'react';
import type { Change, ContractDiff, KeyChange } from '../model/diff';
import type { Refusal } from '../model/updateRules';
import { renderCondition } from '../model/constraints';
import { BOOK } from '../model/describe';

interface Props {
  diff: ContractDiff;
  baseLabel: string;
  headLabel: string;
  pr?: { url: string; title?: string; file: string };
  onlyChanged: boolean;
  onOnlyChanged: (v: boolean) => void;
  onSelect: (change: Change) => void;
  onExit: () => void;
}

const MARK = { added: '+', removed: '−', changed: '~' } as const;

export function formatValue(v: unknown): string {
  if (v === undefined) return '∅';
  const text = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

/** A one-line summary of an added or removed property / index / type. */
function brief(change: Change): string | undefined {
  const v = (change.after ?? change.before) as Record<string, unknown> | undefined;
  if (!v || typeof v !== 'object') return undefined;
  if (change.scope === 'rule') return renderCondition(v);
  if (change.scope === 'index') {
    const props = Array.isArray(v.properties) ? v.properties.map((p) => Object.keys(p as object)[0]).join(', ') : '';
    return `(${props})${v.unique ? ' unique' : ''}`;
  }
  if (change.scope === 'field') {
    const bits = [String(v.type ?? (v.$ref ? `$ref ${String(v.$ref)}` : 'object'))];
    for (const k of ['maxLength', 'maxBytes', 'maximum', 'maxItems', 'requiredSince']) if (v[k] !== undefined) bits.push(`${k} ${String(v[k])}`);
    if (v.refersTo) bits.push('refersTo');
    return bits.join(', ');
  }
  if (change.scope === 'type') {
    const n = v.properties && typeof v.properties === 'object' ? Object.keys(v.properties).length : 0;
    return `${n} propert${n === 1 ? 'y' : 'ies'}`;
  }
  return undefined;
}

function keyLine(k: KeyChange): string {
  if (k.key === 'required') return k.after !== undefined ? `required + ${String(k.after)}` : `required − ${String(k.before)}`;
  return `${k.key}: ${formatValue(k.before)} → ${formatValue(k.after)}`;
}

export function RefusalLine({ r }: { r: Refusal }) {
  return (
    <div className={`cv-refusal cv-refusal-${r.severity}`}>
      <span className="cv-refusal-code">
        {r.severity === 'refused' ? '✕' : '?'} {r.code}
      </span>{' '}
      <span className="cv-refusal-error">{r.error}</span>: {r.rule}{' '}
      <a href={r.href} target="_blank" rel="noreferrer" className="cv-book">
        rule ↗
      </a>
    </div>
  );
}

export function ChangeBody({ change }: { change: Change }) {
  const summary = change.kind !== 'changed' ? brief(change) : undefined;
  return (
    <>
      {summary && <div className="cv-change-brief cv-mono">{summary}</div>}
      {change.scope === 'rule' && change.kind === 'changed' && (
        <div className="cv-change-keys cv-mono">
          <div>− {renderCondition(change.before)}</div>
          <div>+ {renderCondition(change.after)}</div>
        </div>
      )}
      {change.keys.length > 0 && (
        <div className="cv-change-keys cv-mono">
          {change.keys.map((k, i) => (
            <div key={i}>{keyLine(k)}</div>
          ))}
        </div>
      )}
      {change.refusals.map((r, i) => (
        <RefusalLine key={i} r={r} />
      ))}
    </>
  );
}

export function ChangesPanel({ diff, baseLabel, headLabel, pr, onlyChanged, onOnlyChanged, onSelect, onExit }: Props) {
  const [refusedOnly, setRefusedOnly] = useState(false);
  const [open, setOpen] = useState(true);
  const { summary } = diff;

  const groups = useMemo(() => {
    const shown = diff.changes.filter((c) => !refusedOnly || c.refusals.some((r) => r.severity === 'refused'));
    const byGroup = new Map<string, Change[]>();
    for (const c of shown) {
      const g = c.entity ?? 'contract';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(c);
    }
    const order = ['contract', ...diff.merged.entities.map((e) => e.name)];
    return [...byGroup.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [diff, refusedOnly]);

  return (
    <div className={`cv-changes ${open ? 'open' : ''}`}>
      <button type="button" className="cv-metapanel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          Changes <span className="cv-muted">({summary.changes})</span>
          {summary.refused > 0 && <span className="cv-changes-badge">{summary.refused} refused</span>}
        </span>
        <span className="cv-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="cv-changes-body">
          <div className="cv-changes-sides cv-mono">
            <div>
              <span className="cv-muted">base</span> {baseLabel}
            </div>
            <div>
              <span className="cv-muted">head</span> {headLabel}
            </div>
            {pr && (
              <div>
                <a href={pr.url} target="_blank" rel="noreferrer">
                  {pr.title ?? pr.url}
                </a>
              </div>
            )}
          </div>
          <p className={`cv-changes-verdict ${summary.refused ? 'bad' : 'good'}`}>
            {summary.changes === 0
              ? 'The two versions are the same.'
              : summary.refused
                ? `As an update of the base, the platform would refuse ${summary.refused === 1 ? 'one change' : `${summary.refused} changes`}. A fresh registration is not bound by these rules.`
                : 'No change breaks an update rule.'}
            {summary.checks > 0 && ` ${summary.checks} to check by hand.`}
          </p>
          <div className="cv-changes-filters">
            <label>
              <input type="checkbox" checked={refusedOnly} onChange={(e) => setRefusedOnly(e.target.checked)} /> refused only
            </label>
            <label>
              <input type="checkbox" checked={onlyChanged} onChange={(e) => onOnlyChanged(e.target.checked)} /> hide unchanged types
            </label>
          </div>
          {groups.map(([group, changes]) => (
            <div key={group} className="cv-changes-group">
              <div className="cv-meta-subhead">{group}</div>
              {changes.map((c) => (
                <button key={c.id} type="button" className={`cv-change cv-change-${c.kind}`} onClick={() => onSelect(c)}>
                  <span className="cv-change-title">
                    <span className="cv-diff-mark">{MARK[c.kind]}</span>
                    {c.scope === 'contract' ? c.title : c.title.replace(`${group}.`, '').replace(`${group} `, '')}
                  </span>
                  <ChangeBody change={c} />
                </button>
              ))}
            </div>
          ))}
          <p className="cv-muted cv-changes-foot">
            Verdicts follow the update rules in{' '}
            <a href={`${BOOK}contract-keywords.html`} target="_blank" rel="noreferrer">
              The Dash Platform Book
            </a>
            ; the platform's own check is <code>DataContract::validate_update</code>.
          </p>
          <button type="button" className="cv-changes-exit" onClick={onExit}>
            Exit compare
          </button>
        </div>
      )}
    </div>
  );
}
