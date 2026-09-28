import { useState } from 'react';
import type { Network, ViewKind } from '../config';
import type { ContractModel } from '../model/types';
import { truncateMiddle } from '../format';
import { EXAMPLES } from '../examples';

const NETWORKS: Network[] = ['testnet', 'mainnet', 'devnet', 'local'];

interface Props {
  network: Network;
  onNetwork: (n: Network) => void;
  devnetName: string;
  onDevnetName: (name: string) => void;
  onLoad: (contractId: string) => void;
  onExample: (key: string) => void;
  onPaste: () => void;
  view: ViewKind;
  onView: (v: ViewKind) => void;
  status: 'idle' | 'loading' | 'ready' | 'error';
  model: ContractModel | null;
  contractId: string;
  onContractId: (id: string) => void;
}

const GROUPS = [...new Set(EXAMPLES.map((e) => e.group))];

export function Toolbar({
  network,
  onNetwork,
  devnetName,
  onDevnetName,
  onLoad,
  onExample,
  onPaste,
  view,
  onView,
  status,
  model,
  contractId,
  onContractId,
}: Props) {
  const [example, setExample] = useState('');
  const declared = model?.relationships.filter((r) => r.kind === 'declared').length ?? 0;

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
        {network === 'devnet' && (
          <input
            type="text"
            className="cv-devnet"
            placeholder="devnet name"
            value={devnetName}
            spellCheck={false}
            onChange={(e) => onDevnetName(e.target.value)}
            aria-label="Devnet name"
          />
        )}
        <input
          type="text"
          className="cv-mono"
          placeholder="data contract id (base58)"
          value={contractId}
          spellCheck={false}
          onChange={(e) => onContractId(e.target.value)}
          aria-label="Contract id"
        />
        <button type="submit" className="cv-primary" disabled={status === 'loading' || !contractId.trim()}>
          {status === 'loading' ? 'Loading…' : 'Load'}
        </button>
        <button type="button" onClick={onPaste}>
          Paste JSON
        </button>
        <select
          value={example}
          aria-label="Examples"
          onChange={(e) => {
            const key = e.target.value;
            setExample('');
            if (key) onExample(key);
          }}
        >
          <option value="">Examples…</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {EXAMPLES.filter((ex) => ex.group === g).map((ex) => (
                <option key={ex.key} value={ex.key}>
                  {ex.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </form>

      <div className="cv-toolbar-right">
        {model && (
          <span className="cv-meta" title={model.contractId}>
            {model.entities.length} types · {declared} references
            {model.relationships.length > declared ? ` · ${model.relationships.length - declared} inferred` : ''}
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
