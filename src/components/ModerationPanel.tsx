import { useState } from 'react';
import type { ContractModel } from '../model/types';
import { formatDuration } from '../model/describe';
import {
  MODERATION_HREF,
  moderationBandLines,
  moderationOverview,
  RESTORE_WINDOW_SECONDS,
  TEAM_ABILITY_LABEL,
} from '../model/moderation';

const LIST_LABEL: Record<string, string> = { banlist: 'ban identities', suspensions: 'suspend identities', warnings: 'warn identities' };

/** Everything the contract's moderators may do, in one place: who they are, the lists they keep, and their powers per document type. */
export function ModerationPanel({ model, onFocus }: { model: ContractModel; onFocus: (nodeId: string) => void }) {
  const overview = moderationOverview(model);
  const [open, setOpen] = useState(true);
  if (!overview) return null;
  const untouched = model.entities.map((e) => e.name).filter((n) => !overview.types.some((t) => t.type === n));
  return (
    <div className={`cv-metapanel cv-modpanel ${open ? 'open' : ''}`}>
      <button type="button" className="cv-metapanel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <span className="cv-modband-icon" aria-hidden="true">
            ⛨
          </span>{' '}
          Moderation · {overview.types.length} of {model.entities.length} types
        </span>
        <span className="cv-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="cv-metapanel-body">
          <p className="cv-meta-desc">
            <a href={MODERATION_HREF.config} target="_blank" rel="noreferrer">
              {overview.who}
            </a>
            {overview.interim ? ` Until a team is seated, ${overview.interim}.` : ''}
          </p>
          <div className="cv-meta-row">
            <span className="cv-meta-label">contract-wide</span>
            <span className="cv-meta-value">{overview.lists.length ? overview.lists.map((l) => LIST_LABEL[l] ?? l).join(', ') : 'no lists'}</span>
          </div>
          {overview.election.map((r) => (
            <div key={r.label} className="cv-meta-row">
              <span className="cv-meta-label">{r.label}</span>
              <span className="cv-meta-value">{r.value}</span>
            </div>
          ))}

          {overview.types.map((t) => (
            <div key={t.type} className="cv-modtype">
              <button type="button" className="cv-modtype-name cv-mono" onClick={() => onFocus(t.type)} title="Show it on the canvas">
                {t.type}
              </button>
              <ul className="cv-modtype-lines">
                {moderationBandLines(t).map((l) => (
                  <li key={l.text} title={l.detail}>
                    <a href={l.href} target="_blank" rel="noreferrer">
                      {l.text}
                    </a>
                  </li>
                ))}
                {t.team && t.team.length > 0 && <li>seated team: {t.team.map((a) => TEAM_ABILITY_LABEL[a]).join(', ')}</li>}
                {!t.canDelete && !t.changeFields.length && <li>no document ability: the team acts only on the authors</li>}
              </ul>
              {t.keepsRecord && (
                <button type="button" className="cv-modtype-record" onClick={() => onFocus(`record:${t.type}`)} title="Show the removal record on the canvas">
                  removal record keeps: owner, moderator, reason, time, hash
                  {t.keptFields.length ? `, ${t.keptFields.join(', ')}` : ''}
                </button>
              )}
            </div>
          ))}

          {untouched.length > 0 && (
            <div className="cv-meta-row">
              <span className="cv-meta-label">not moderated</span>
              <span className="cv-meta-value cv-mono">{untouched.join(', ')}</span>
            </div>
          )}
          <p className="cv-muted cv-modpanel-foot">
            A deletion that keeps a record can be restored for {formatDuration(RESTORE_WINDOW_SECONDS)}.{' '}
            <a href={MODERATION_HREF.model} target="_blank" rel="noreferrer">
              How moderation works
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
