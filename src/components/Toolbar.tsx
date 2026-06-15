import { useState } from 'react';
import type { Network, ViewKind } from '../config';
import type { ContractModel } from '../model/types';
import { truncateMiddle } from '../format';

const NETWORKS: Network[] = ['testnet', 'mainnet', 'devnet', 'local'];

interface Props {
  network: Network;
  onNetwork: (n: Network) => void;
  onLoad: (contractId: string) => void;
  onDemo: () => void;
  onPaste: () => void;
  view: ViewKind;
  onView: (v: ViewKind) => void;
  status: 'idle' | 'loading' | 'ready' | 'error';
  model: ContractModel | null;
  initialContractId: string;
}

export function Toolbar({
  network,
  onNetwork,
  onLoad,
  onDemo,
  onPaste,
  view,
  onView,
  status,
  model,
  initialContractId,
}: Props) {
  const [contractId, setContractId] = useState(initialContractId);

  return (
    <header className="cv-toolbar">
      <div className="cv-brand">
        <strong>Dash Contract Visualizer</strong>
        <span className="cv-readonly">read-only</span>
      </div>

      <form
        className="cv-load"
        onSubmit={(e) => {
          e.preventDefault();
          if (contractId.trim()) onLoad(contractId.trim());
        }}
      >
        <select value={network} onChange={(e) => onNetwork(e.target.value as Network)} aria-label="Network">
          {NETWORKS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="cv-mono"
          placeholder="data contract id (base58)"
          value={contractId}
          spellCheck={false}
          onChange={(e) => setContractId(e.target.value)}
          aria-label="Contract id"
        />
        <button type="submit" className="cv-primary" disabled={status === 'loading' || !contractId.trim()}>
          {status === 'loading' ? 'Loading…' : 'Load'}
        </button>
        <button type="button" onClick={onPaste}>
          Paste JSON
        </button>
        <button type="button" onClick={onDemo}>
          Demo
        </button>
      </form>

      <div className="cv-toolbar-right">
        {model && (
          <span className="cv-meta" title={model.contractId}>
            {model.entities.length} types · {model.relationships.length} relations
            {model.contractId ? ` · ${truncateMiddle(model.contractId, 5, 5)}` : ''}
          </span>
        )}
        <div className="cv-toggle" role="group" aria-label="View">
          <button type="button" className={view === 'uml' ? 'active' : ''} onClick={() => onView('uml')}>
            UML
          </button>
          <button type="button" className={view === 'merise' ? 'active' : ''} onClick={() => onView('merise')}>
            Merise
          </button>
        </div>
      </div>
    </header>
  );
}
