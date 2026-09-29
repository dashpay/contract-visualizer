import { useEffect, useMemo, useState } from 'react';
import {
  SIGNATURE_KEY_TYPES,
  adjustableFields,
  bytesToCredits,
  formatBytes,
  formatCredits,
  indexAlone,
  type CostOptions,
  type DocumentCreateCost,
  type Scenarios,
} from '../model/cost';
import { CostUnavailableError, loadDocumentCreateCost } from '../sdk/cost';
import { useDashPrice } from './useDashPrice';

interface Props {
  documentType: string;
  contractJson: unknown;
  onClose: () => void;
}

type State =
  | { status: 'loading'; previous?: DocumentCreateCost }
  | { status: 'ready'; cost: DocumentCreateCost }
  | { status: 'error'; message: string; unavailable: boolean };

const BOOK = 'https://dashpay.github.io/platform/fees/document-cost.html';

function PriceLine({ price }: { price: ReturnType<typeof useDashPrice> }) {
  const [draft, setDraft] = useState(price.override === null ? '' : String(price.override));
  const fetched = price.fetched;
  return (
    <div className="cv-cost-price">
      <span>
        {price.override !== null
          ? `1 DASH = $${price.override} (your price)`
          : fetched
            ? `1 DASH = $${fetched.usd.toLocaleString('en-US')} (${fetched.source}, ${fetched.at.toLocaleTimeString()})`
            : 'Fetching the Dash price…'}
      </span>
      <label>
        use my price $
        <input
          type="number"
          min="0"
          step="0.01"
          value={draft}
          placeholder={fetched ? String(fetched.usd) : ''}
          onChange={(e) => {
            setDraft(e.target.value);
            const usd = Number(e.target.value);
            price.setOverride(e.target.value === '' || !(usd > 0) ? null : usd);
          }}
        />
      </label>
    </div>
  );
}

function Amount({ cost, credits, usd }: { cost: DocumentCreateCost; credits: number; usd: number | null }) {
  return <span title={`${credits.toLocaleString('en-US')} credits`}>{formatCredits(cost, credits, usd)}</span>;
}

function BytesRow({
  cost,
  label,
  detail,
  bytes,
  usd,
}: {
  cost: DocumentCreateCost;
  label: React.ReactNode;
  detail?: string;
  bytes: Scenarios;
  usd: number | null;
}) {
  return (
    <tr>
      <td>
        {label}
        {detail && <div className="cv-muted cv-cost-detail">{detail}</div>}
      </td>
      <td>
        {formatBytes(bytes.newValues)}
        <div>
          <Amount cost={cost} credits={bytesToCredits(cost, bytes.newValues)} usd={usd} />
        </div>
      </td>
      <td>
        {formatBytes(bytes.knownValues)}
        <div>
          <Amount cost={cost} credits={bytesToCredits(cost, bytes.knownValues)} usd={usd} />
        </div>
      </td>
    </tr>
  );
}

function Fields({
  cost,
  options,
  onChange,
}: {
  cost: DocumentCreateCost;
  options: CostOptions;
  onChange: (fields: CostOptions['fields']) => void;
}) {
  const adjustable = adjustableFields(cost);
  const fixed = cost.fields.length - adjustable.length;
  const set = (path: string, change: { present?: boolean; length?: number }) =>
    onChange({ ...options.fields, [path]: { ...options.fields?.[path], ...change } });
  return (
    <>
      {adjustable.length === 0 && <p className="cv-muted">Every field has a fixed size: nothing to adjust.</p>}
      <ul className="cv-cost-fields">
        {adjustable.map((field) => (
          <li key={field.path}>
            <span className="cv-mono">{field.path}</span>
            <span className="cv-muted"> {field.kind}</span>
            {field.optional && (
              <label>
                <input
                  type="checkbox"
                  checked={field.present}
                  onChange={(e) => set(field.path, { present: e.target.checked })}
                />{' '}
                present
              </label>
            )}
            {field.length !== undefined && field.present && (
              <label className="cv-cost-length">
                length
                <input
                  type="range"
                  min={field.minLength ?? 0}
                  max={field.maxLength ?? Math.max(1024, field.length * 2)}
                  value={field.length}
                  onChange={(e) => set(field.path, { length: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min={field.minLength ?? 0}
                  max={field.maxLength ?? undefined}
                  value={field.length}
                  onChange={(e) => set(field.path, { length: Number(e.target.value) })}
                />
                <span className="cv-muted">
                  {field.maxLength !== undefined ? `of ${field.minLength ?? 0}–${field.maxLength}` : ''}
                  {field.kind === 'string' ? ' characters' : field.kind === 'array' ? ' elements' : ' bytes'}
                </span>
              </label>
            )}
          </li>
        ))}
      </ul>
      {fixed > 0 && (
        <p className="cv-muted">
          {fixed} field{fixed === 1 ? ' has' : 's have'} a fixed size (identifiers, numbers, booleans, dates) and need
          no input.
        </p>
      )}
    </>
  );
}

export function CostPanel({ documentType, contractJson, onClose }: Props) {
  const [options, setOptions] = useState<CostOptions>({});
  const [state, setState] = useState<State>({ status: 'loading' });
  const price = useDashPrice();
  const usd = price.usdPerDash;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ status: 'loading', previous: s.status === 'ready' ? s.cost : undefined }));
    const timer = setTimeout(() => {
      loadDocumentCreateCost(contractJson, documentType, options)
        .then((cost) => alive && setState({ status: 'ready', cost }))
        .catch((err: unknown) => {
          if (!alive) return;
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
            unavailable: err instanceof CostUnavailableError,
          });
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [contractJson, documentType, options]);

  const cost = state.status === 'ready' ? state.cost : state.status === 'loading' ? state.previous : undefined;
  const indexes = useMemo(
    () => (cost ? [...cost.indexes].sort((a, b) => indexAlone(b).newValues - indexAlone(a).newValues) : []),
    [cost],
  );

  return (
    <div className="cv-modal-scrim" onClick={onClose}>
      <div
        className="cv-modal cv-layout cv-cost"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`What a ${documentType} costs`}
      >
        <div className="cv-modal-head">
          <h2>
            What a <span className="cv-mono">{documentType}</span> document costs
          </h2>
          <button type="button" className="cv-inspector-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="cv-muted">
          Computed by Drive's own fee rules (<code>documentCreateCost</code>) from the contract, for a document of the
          sizes set below. The storage is exact; processing is estimated.{' '}
          <a href={BOOK} target="_blank" rel="noreferrer">
            How it is computed
          </a>
        </p>
        <PriceLine price={price} />

        {state.status === 'error' && (
          <p className={state.unavailable ? 'cv-muted' : 'cv-error'}>
            {state.unavailable ? state.message : `Could not compute the cost: ${state.message}`}
          </p>
        )}
        {!cost && state.status === 'loading' && (
          <p className="cv-muted">Computing the cost (loading the SDK the first time)…</p>
        )}

        {cost && (
          <div className={state.status === 'loading' ? 'cv-cost-body cv-cost-stale' : 'cv-cost-body'}>
            <div className="cv-cost-totals">
              <div>
                <div className="cv-muted">First document with these index values</div>
                <strong>
                  <Amount cost={cost} credits={cost.totalCredits.newValues} usd={usd} />
                </strong>
                <div className="cv-muted cv-cost-detail">
                  {formatBytes(cost.storage.bytes.newValues)} stored · the document is{' '}
                  {formatBytes(cost.documentBytes)}
                </div>
              </div>
              <div>
                <div className="cv-muted">A later document with the same values</div>
                <strong>
                  <Amount cost={cost} credits={cost.totalCredits.knownValues} usd={usd} />
                </strong>
                <div className="cv-muted cv-cost-detail">
                  {formatBytes(cost.storage.bytes.knownValues)} stored: only its own entries
                </div>
              </div>
            </div>
            {cost.contractCharges.some((c) => c.kind !== 'actionFee') && (
              <p className="cv-muted">Plus what the contract charges besides credits, listed below.</p>
            )}

            <h3>Storage</h3>
            <table className="cv-cost-table">
              <thead>
                <tr>
                  <th />
                  <th>values new</th>
                  <th>values stored</th>
                </tr>
              </thead>
              <tbody>
                <BytesRow cost={cost} label="The document itself" bytes={cost.storage.primaryBytes} usd={usd} />
                {indexes.map((index) => {
                  const shared = index.sharedWith.length > 0;
                  return (
                    <BytesRow
                      key={index.name}
                      cost={cost}
                      label={
                        <>
                          index <span className="cv-mono">{index.name}</span> on its own
                        </>
                      }
                      detail={
                        shared
                          ? `shared with ${index.sharedWith.join(', ')}: ${formatBytes(index.sharedBytes.newValues)} (${formatCredits(cost, bytesToCredits(cost, index.sharedBytes.newValues), usd)}, paid once) + its own ${formatBytes(index.ownBytes.newValues)} (${formatCredits(cost, bytesToCredits(cost, index.ownBytes.newValues), usd)})`
                          : undefined
                      }
                      bytes={indexAlone(index)}
                      usd={usd}
                    />
                  );
                })}
                {cost.storage.expirationBytes.newValues > 0 && (
                  <BytesRow
                    cost={cost}
                    label="Its entry in the expirations tree (ttl)"
                    bytes={cost.storage.expirationBytes}
                    usd={usd}
                  />
                )}
                {cost.storage.preallocatedBytes.newValues > 0 && (
                  <BytesRow
                    cost={cost}
                    label="Prepaid trees for other types' preallocated indexes"
                    bytes={cost.storage.preallocatedBytes}
                    usd={usd}
                  />
                )}
                <BytesRow cost={cost} label={<strong>All storage</strong>} bytes={cost.storage.bytes} usd={usd} />
              </tbody>
            </table>

            <h3>Processing</h3>
            <table className="cv-cost-table">
              <tbody>
                {cost.processing.map((part) => (
                  <tr key={part.code}>
                    <td>
                      {part.text} <span className="cv-cost-tag">{part.exact ? 'exact' : 'estimated'}</span>
                    </td>
                    <td>
                      <Amount cost={cost} credits={part.credits.newValues} usd={usd} />
                    </td>
                    <td>
                      <Amount cost={cost} credits={part.credits.knownValues} usd={usd} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cv-cost-assumptions">
              <label>
                documents already stored
                <input
                  type="number"
                  min="0"
                  value={options.existingDocuments ?? cost.assumptions.existingDocuments}
                  onChange={(e) => setOptions({ ...options, existingDocuments: Math.max(0, Number(e.target.value)) })}
                />
              </label>
              <label>
                signing key
                <select
                  value={options.signatureKeyType ?? cost.assumptions.signatureKeyType}
                  onChange={(e) => setOptions({ ...options, signatureKeyType: e.target.value })}
                >
                  {SIGNATURE_KEY_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                fee increase %
                <input
                  type="number"
                  min="0"
                  value={options.userFeeIncrease ?? cost.assumptions.userFeeIncrease}
                  onChange={(e) => setOptions({ ...options, userFeeIncrease: Math.max(0, Number(e.target.value)) })}
                />
              </label>
            </div>

            {cost.contractCharges.length > 0 && (
              <>
                <h3>Charged by the contract</h3>
                <ul className="cv-cost-charges">
                  {cost.contractCharges.map((charge, i) => (
                    <li key={i}>
                      {charge.kind === 'actionFee' && (
                        <>
                          Action fee:{' '}
                          <Amount cost={cost} credits={charge.charged.owner + charge.charged.moderators} usd={usd} />{' '}
                          <span className="cv-muted">
                            ({charge.charged.owner.toLocaleString('en-US')} credits to the owner,{' '}
                            {charge.charged.moderators.toLocaleString('en-US')} to the moderators
                            {charge.pricing === 'feeMultiplier' ? ', scaled by the fee multiplier' : ''}; included in
                            the totals)
                          </span>
                        </>
                      )}
                      {charge.kind === 'tokenCost' && (
                        <>
                          Token cost: {charge.amount.toLocaleString('en-US')} of token #{charge.tokenPosition}
                          {charge.tokenContractId ? ` of contract ${charge.tokenContractId}` : ''},{' '}
                          {charge.effect === 'burn' ? 'burned' : 'paid to the contract owner'}
                          {charge.optional ? ' (optional)' : ''}
                        </>
                      )}
                      {charge.kind === 'contestFund' && (
                        <>
                          Contest fund: <Amount cost={cost} credits={charge.credits} usd={usd} />{' '}
                          <span className="cv-muted">
                            when the value of <span className="cv-mono">{charge.index}</span> is contested (doubling past
                            250 contenders)
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {cost.refund.sameEpoch && cost.refund.afterOneYear && (
              <>
                <h3>Refund when deleted</h3>
                <p className="cv-muted">
                  In the same epoch: <Amount cost={cost} credits={cost.refund.sameEpoch.newValues} usd={usd} /> · a year
                  later: <Amount cost={cost} credits={cost.refund.afterOneYear.newValues} usd={usd} /> (the storage fee,
                  less what the epochs passed were paid)
                </p>
              </>
            )}

            <h3>Adjust the document</h3>
            <Fields cost={cost} options={options} onChange={(fields) => setOptions({ ...options, fields })} />
          </div>
        )}
      </div>
    </div>
  );
}
