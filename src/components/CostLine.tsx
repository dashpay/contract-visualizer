import { useEffect, useState } from 'react';
import { formatCredits, type DocumentCreateCost } from '../model/cost';
import { CostUnavailableError, loadDocumentCreateCost } from '../sdk/cost';
import { useDashPrice } from './useDashPrice';

type State =
  | { status: 'loading' }
  | { status: 'ready'; cost: DocumentCreateCost }
  | { status: 'error'; message: string; unavailable: boolean };

/**
 * The approximate cost of one document of a type, for a document of middle
 * sizes, with a button to the full breakdown.
 */
export function CostLine({
  documentType,
  contractJson,
  onShowCost,
}: {
  documentType: string;
  contractJson: unknown;
  onShowCost: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { usdPerDash } = useDashPrice();

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    loadDocumentCreateCost(contractJson, documentType)
      .then((cost) => alive && setState({ status: 'ready', cost }))
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          unavailable: err instanceof CostUnavailableError,
        });
      });
    return () => {
      alive = false;
    };
  }, [contractJson, documentType]);

  if (state.status === 'loading') return <p className="cv-muted cv-cost-line">Estimating what a document costs…</p>;
  if (state.status === 'error') {
    return (
      <p className="cv-muted cv-cost-line" title={state.message}>
        {state.unavailable ? 'The cost estimate appears with the next SDK release.' : 'No cost estimate for this type.'}
      </p>
    );
  }
  const { cost } = state;
  return (
    <p className="cv-cost-line">
      About <strong>{formatCredits(cost, cost.totalCredits.newValues, usdPerDash)}</strong> per document
      {cost.totalCredits.knownValues < cost.totalCredits.newValues && (
        <span className="cv-muted">
          {' '}
          ({formatCredits(cost, cost.totalCredits.knownValues, usdPerDash)} once its index values are stored)
        </span>
      )}{' '}
      <button type="button" className="cv-link-button" onClick={onShowCost}>
        details
      </button>
    </p>
  );
}
