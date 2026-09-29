import { useEffect, useState } from 'react';
import {
  STRUCTURE_VIEWER,
  WRAPPER_DETAIL,
  keyDetail,
  keyText,
  kindDetail,
  kindFamily,
  layoutSummary,
  structureViewerUrl,
  type DocumentTypeLayout,
  type LayoutNode,
} from '../model/layout';
import { LayoutUnavailableError, loadDocumentTypeLayout } from '../sdk/layout';

interface Props {
  documentType: string;
  contractJson: unknown;
  onClose: () => void;
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; layout: DocumentTypeLayout }
  | { status: 'error'; message: string; unavailable: boolean };

const FAMILIES: Array<[string, string]> = [
  ['plain', 'plain tree'],
  ['count', 'counts'],
  ['sum', 'sums'],
  ['countSum', 'counts and sums'],
  ['indexed', 'ranked'],
  ['value', 'value / reference'],
];

function Row({ node, depth, prefix }: { node: LayoutNode; depth: number; prefix?: string }) {
  const [open, setOpen] = useState(depth < 8);
  const hasChildren = node.children.length > 0;
  return (
    <li className="cv-layout-item">
      <div className="cv-layout-row">
        <button
          type="button"
          className="cv-layout-caret"
          onClick={() => setOpen((o) => !o)}
          disabled={!hasChildren}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {hasChildren ? (open ? '▾' : '▸') : '·'}
        </button>
        {prefix && <span className="cv-layout-prefix">{prefix}</span>}
        <span className={`cv-layout-key ${node.key.kind === 'fixed' ? 'fixed' : 'family'}`} title={keyDetail(node.key)}>
          {keyText(node.key)}
        </span>
        <span className={`cv-layout-kind cv-kind-${kindFamily(node.element)}`} title={kindDetail(node.element)}>
          {node.element}
        </span>
        {node.wrapper && (
          <span className="cv-layout-wrapper" title={WRAPPER_DETAIL[node.wrapper] ?? node.wrapper}>
            in {node.wrapper}
          </span>
        )}
        {node.rankedAxes.length > 0 && (
          <span className="cv-layout-ranked" title="The tree keeps its entries ordered by these totals.">
            ranked by {node.rankedAxes.join(', ')}
          </span>
        )}
        {node.role !== 'documentType' && node.indexes.length > 0 && (
          <span className="cv-layout-indexes">{node.indexes.join(', ')}</span>
        )}
        <a
          className="cv-layout-link"
          href={structureViewerUrl(node)}
          target="_blank"
          rel="noreferrer"
          title={`This kind of layer in the GroveDB structure viewer (${node.structureNode})`}
        >
          ↗
        </a>
      </div>
      {node.notes.length > 0 && (
        <ul className="cv-layout-notes">
          {node.notes.map((n) => (
            <li key={n.code}>{n.text}</li>
          ))}
        </ul>
      )}
      {node.alternative && (
        <ul className="cv-layout-tree">
          <Row node={node.alternative.node} depth={depth + 1} prefix={`or, when ${node.alternative.when}:`} />
        </ul>
      )}
      {hasChildren && open && (
        <ul className="cv-layout-tree">
          {node.children.map((child, i) => (
            <Row key={`${child.role}-${i}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function LayoutPanel({ documentType, contractJson, onClose }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    loadDocumentTypeLayout(contractJson, documentType)
      .then((layout) => alive && setState({ status: 'ready', layout }))
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          unavailable: err instanceof LayoutUnavailableError,
        });
      });
    return () => {
      alive = false;
    };
  }, [contractJson, documentType]);

  const summary = state.status === 'ready' ? layoutSummary(state.layout) : undefined;

  return (
    <div className="cv-modal-scrim" onClick={onClose}>
      <div
        className="cv-modal cv-layout"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`GroveDB layout of ${documentType}`}
      >
        <div className="cv-modal-head">
          <h2>
            GroveDB layout of <span className="cv-mono">{documentType}</span>
          </h2>
          <button type="button" className="cv-inspector-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="cv-muted">
          Every tree and element Drive writes for this document type, under{' '}
          <code>[64, contract id, 1, {documentType}]</code>, computed by Drive's own rules (
          <code>documentTypeLayout</code>). <code>‹…›</code> stands for one key per document or value. Each ↗ opens
          that kind of layer in the{' '}
          <a href={STRUCTURE_VIEWER} target="_blank" rel="noreferrer">
            GroveDB structure viewer
          </a>
          .
        </p>
        <div className="cv-layout-legend">
          {FAMILIES.map(([family, label]) => (
            <span key={family} className={`cv-layout-kind cv-kind-${family}`}>
              {label}
            </span>
          ))}
        </div>

        {state.status === 'loading' && <p className="cv-muted">Computing the layout (loading the SDK the first time)…</p>}
        {state.status === 'error' && (
          <p className={state.unavailable ? 'cv-muted' : 'cv-error'}>
            {state.unavailable ? state.message : `Could not compute the layout: ${state.message}`}
          </p>
        )}
        {state.status === 'ready' && summary && (
          <>
            <p className="cv-layout-summary">
              {summary.layers} layers · {summary.aggregates} counted or summed · {summary.ranked} ranked ·{' '}
              {summary.wrapped} wrapped to contribute nothing
            </p>
            <ul className="cv-layout-tree cv-layout-root">
              <Row node={state.layout.root} depth={0} />
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
