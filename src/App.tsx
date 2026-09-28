import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEdgesState, useNodesState, type Edge } from '@xyflow/react';
import { loadConfig, saveOverride, type Network, type ViewKind } from './config';
import { loadContractModel } from './sdk/contract';
import { resetConnections } from './sdk/pool';
import { modelFromPastedJson } from './model/introspect';
import { withRelationships } from './model/relationships';
import type { ContractModel } from './model/types';
import { DEFAULT_FILTERS, toEdges, toNodes, type DiagramNode, type Filters } from './flow/diagramToFlow';
import { layoutNodes } from './flow/layout';
import { SelectionContext, type Selection } from './flow/selection';
import { Canvas } from './flow/Canvas';
import { Toolbar } from './components/Toolbar';
import { InspectorPanel } from './components/InspectorPanel';
import { PasteContractModal } from './components/PasteContractModal';
import { ContractMetaPanel } from './components/ContractMetaPanel';
import { EXAMPLES, exampleId, exampleKey } from './examples';

const initial = loadConfig();

type Status = 'idle' | 'loading' | 'ready' | 'error';

export default function App() {
  const [network, setNetwork] = useState<Network>(initial.network);
  const [devnetName, setDevnetName] = useState(initial.devnetName ?? '');
  const [view, setView] = useState<ViewKind>(initial.view);
  const [contractInput, setContractInput] = useState(exampleKey(initial.contractId) ? '' : initial.contractId);
  const [model, setModel] = useState<ContractModel | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hiddenEdges, setHiddenEdges] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<Selection>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteError, setPasteError] = useState<string | undefined>(undefined);
  const [layoutKey, setLayoutKey] = useState(0);

  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Refs so the async layout/setters read current state without re-creating callbacks.
  const viewRef = useRef(view);
  const hiddenRef = useRef(hiddenEdges);
  const filtersRef = useRef(filters);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  viewRef.current = view;
  hiddenRef.current = hiddenEdges;
  filtersRef.current = filters;
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const updateUrl = useCallback((source: string, net: Network, devnet: string, v: ViewKind) => {
    const p = new URLSearchParams();
    const key = exampleKey(source);
    if (key) p.set('example', key);
    else if (source) {
      p.set('contract', source);
      p.set('network', net);
      if (net === 'devnet' && devnet) p.set('devnet', devnet);
    }
    p.set('view', v);
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, []);

  /** Rebuild nodes and edges from the model; lay out from scratch when asked or when the node set changed. */
  const rebuild = useCallback(
    async (m: ContractModel, relayout: boolean) => {
      const es = toEdges(m, viewRef.current, hiddenRef.current, filtersRef.current);
      const built = toNodes(m, viewRef.current, es);
      const current = new Map(nodesRef.current.map((n) => [n.id, n]));
      const sameSet = built.length === current.size && built.every((n) => current.has(n.id));
      if (relayout || !sameSet) {
        const laid = await layoutNodes(built, es);
        setNodes(laid);
        setEdges(es);
        setLayoutKey((k) => k + 1);
      } else {
        setNodes(built.map((n) => ({ ...n, position: current.get(n.id)!.position, measured: current.get(n.id)!.measured }) as DiagramNode));
        setEdges(es);
      }
    },
    [setNodes, setEdges],
  );

  const applyModel = useCallback(
    async (m: ContractModel, source: string, net: Network, devnet: string) => {
      setModel(m);
      setSelection(null);
      const nextHidden = new Set<string>();
      setHiddenEdges(nextHidden);
      hiddenRef.current = nextHidden;
      await rebuild(m, true);
      setStatus('ready');
      updateUrl(source, net, devnet, viewRef.current);
    },
    [rebuild, updateUrl],
  );

  const load = useCallback(
    async (source: string, net: Network, devnet: string) => {
      setStatus('loading');
      setErrorMsg(null);
      try {
        const m = await loadContractModel({ network: net, contractId: source, devnetName: devnet || undefined, view: viewRef.current });
        saveOverride({ network: net, contractId: source, devnetName: devnet || undefined });
        await applyModel(m, source, net, devnet);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [applyModel],
  );

  // Initial load from URL/localStorage/env.
  useEffect(() => {
    if (initial.contractId) void load(initial.contractId, initial.network, initial.devnetName ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = useCallback((id: string) => void load(id, network, devnetName), [load, network, devnetName]);
  const onExample = useCallback((key: string) => void load(exampleId(key), network, devnetName), [load, network, devnetName]);
  const onOpenContract = useCallback(
    (id: string) => {
      setContractInput(id);
      void load(id, network, devnetName);
    },
    [load, network, devnetName],
  );

  const onNetwork = useCallback((n: Network) => {
    setNetwork(n);
    resetConnections();
  }, []);

  const applyPaste = useCallback(
    (jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText);
        const m = withRelationships(modelFromPastedJson(parsed));
        setPasteOpen(false);
        setPasteError(undefined);
        void applyModel(m, '', network, devnetName);
      } catch (err) {
        setPasteError(err instanceof Error ? err.message : String(err));
      }
    },
    [applyModel, network, devnetName],
  );

  const changeView = useCallback(
    (v: ViewKind) => {
      setView(v);
      viewRef.current = v;
      if (model) void rebuild(model, false);
      saveOverride({ view: v });
      const url = new URL(window.location.href);
      url.searchParams.set('view', v);
      window.history.replaceState(null, '', url.search);
    },
    [model, rebuild],
  );

  const toggleEdge = useCallback(
    (id: string) => {
      const next = new Set(hiddenRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      hiddenRef.current = next;
      setHiddenEdges(next);
      if (model) void rebuild(model, false);
    },
    [model, rebuild],
  );

  const changeFilters = useCallback(
    (f: Filters) => {
      filtersRef.current = f;
      setFilters(f);
      if (model) void rebuild(model, false);
    },
    [model, rebuild],
  );

  const onRelayout = useCallback(async () => {
    const laid = await layoutNodes(nodesRef.current, edgesRef.current);
    setNodes(laid);
  }, [setNodes]);

  const counts = useMemo(() => {
    const rels = model?.relationships ?? [];
    return {
      declared: rels.filter((r) => r.kind === 'declared').length,
      inferred: rels.filter((r) => r.kind === 'inferred').length,
      platform: rels.filter((r) => r.to.startsWith('platform:')).length,
    };
  }, [model]);

  return (
    <SelectionContext.Provider value={setSelection}>
      <div className="cv-app">
        <Toolbar
          network={network}
          onNetwork={onNetwork}
          devnetName={devnetName}
          onDevnetName={setDevnetName}
          onLoad={onLoad}
          onExample={onExample}
          onPaste={() => {
            setPasteError(undefined);
            setPasteOpen(true);
          }}
          view={view}
          onView={changeView}
          status={status}
          model={model}
          contractId={contractInput}
          onContractId={setContractInput}
        />

        <div className="cv-body">
          {status !== 'error' && !model && (
            <div className="cv-empty">
              <p>
                {status === 'loading'
                  ? 'Loading…'
                  : 'Enter a data contract id and pick a network, paste contract JSON, or open an example.'}
              </p>
              {status !== 'loading' && (
                <div className="cv-examples">
                  {EXAMPLES.map((ex) => (
                    <button key={ex.key} type="button" className="cv-example" onClick={() => onExample(ex.key)}>
                      <span className="cv-example-group">{ex.group}</span>
                      <strong>{ex.title}</strong>
                      <span className="cv-muted">{ex.summary}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {status === 'error' && (
            <div className="cv-empty cv-error-box" role="alert">
              <strong>Couldn’t load contract.</strong>
              <p>{errorMsg}</p>
              {network === 'devnet' && !devnetName && <p className="cv-muted">A devnet needs its name (for example moutai).</p>}
            </div>
          )}
          {model && status !== 'error' && (
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onRelayout={onRelayout}
              layoutKey={layoutKey}
              exportName={model.contractId ?? 'contract'}
              filters={filters}
              onFilters={changeFilters}
              counts={counts}
            />
          )}
          {model && status !== 'error' && <ContractMetaPanel model={model} />}
          {model && selection && status !== 'error' && (
            <InspectorPanel
              selection={selection}
              model={model}
              hiddenEdges={hiddenEdges}
              onToggleEdge={toggleEdge}
              onOpenContract={onOpenContract}
              onClose={() => setSelection(null)}
            />
          )}
        </div>

        {pasteOpen && (
          <PasteContractModal onApply={applyPaste} onClose={() => setPasteOpen(false)} error={pasteError} />
        )}
      </div>
    </SelectionContext.Provider>
  );
}
