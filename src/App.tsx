import { useCallback, useEffect, useRef, useState } from 'react';
import { useEdgesState, useNodesState, type Edge, type Node } from '@xyflow/react';
import { loadConfig, saveOverride, type Network, type ViewKind } from './config';
import { loadContractModel } from './sdk/contract';
import { modelFromPastedJson } from './model/introspect';
import { withInferredRelationships } from './model/relationships';
import type { ContractModel } from './model/types';
import { toEdges, toNodes, type EntityNodeData } from './flow/diagramToFlow';
import { layoutNodes } from './flow/layout';
import { SelectionContext, type Selection } from './flow/selection';
import { Canvas } from './flow/Canvas';
import { Toolbar } from './components/Toolbar';
import { InspectorPanel } from './components/InspectorPanel';
import { PasteContractModal } from './components/PasteContractModal';
import { ContractMetaPanel } from './components/ContractMetaPanel';

const initial = loadConfig();

type Status = 'idle' | 'loading' | 'ready' | 'error';

export default function App() {
  const [network, setNetwork] = useState<Network>(initial.network);
  const [view, setView] = useState<ViewKind>(initial.view);
  const [model, setModel] = useState<ContractModel | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hiddenEdges, setHiddenEdges] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteError, setPasteError] = useState<string | undefined>(undefined);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EntityNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Refs so the async layout/setters read current view/hidden without re-creating callbacks.
  const viewRef = useRef(view);
  const hiddenRef = useRef(hiddenEdges);
  viewRef.current = view;
  hiddenRef.current = hiddenEdges;

  const updateUrl = useCallback((contractId: string, net: Network, v: ViewKind) => {
    const p = new URLSearchParams();
    if (contractId) p.set('contract', contractId);
    p.set('network', net);
    p.set('view', v);
    window.history.replaceState(null, '', `?${p.toString()}`);
  }, []);

  const applyModel = useCallback(
    async (m: ContractModel, contractId: string, net: Network) => {
      setModel(m);
      setSelection(null);
      const built = toNodes(m, viewRef.current);
      const es = toEdges(m, viewRef.current, hiddenRef.current);
      const laid = await layoutNodes(built, es);
      setNodes(laid);
      setEdges(es);
      setStatus('ready');
      updateUrl(contractId, net, viewRef.current);
    },
    [setNodes, setEdges, updateUrl],
  );

  const loadFromNetwork = useCallback(
    async (contractId: string, net: Network) => {
      setStatus('loading');
      setErrorMsg(null);
      setNetwork(net);
      try {
        const m = await loadContractModel({ network: net, contractId, view: viewRef.current });
        saveOverride({ network: net, contractId });
        await applyModel(m, contractId === 'demo' ? '' : contractId, net);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [applyModel],
  );

  // Initial load from URL/localStorage/env.
  useEffect(() => {
    if (initial.contractId) void loadFromNetwork(initial.contractId, initial.network);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = useCallback((contractId: string) => void loadFromNetwork(contractId, network), [loadFromNetwork, network]);
  const onDemo = useCallback(() => void loadFromNetwork('demo', 'testnet'), [loadFromNetwork]);

  const applyPaste = useCallback(
    (jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText);
        const m = withInferredRelationships(modelFromPastedJson(parsed));
        setPasteOpen(false);
        setPasteError(undefined);
        void applyModel(m, '', network);
      } catch (err) {
        setPasteError(err instanceof Error ? err.message : String(err));
      }
    },
    [applyModel, network],
  );

  const changeView = useCallback(
    (v: ViewKind) => {
      setView(v);
      viewRef.current = v;
      setNodes((prev) => prev.map((n) => ({ ...n, data: { ...n.data, view: v } })));
      if (model) setEdges(toEdges(model, v, hiddenRef.current));
      saveOverride({ view: v });
    },
    [model, setNodes, setEdges],
  );

  const toggleEdge = useCallback(
    (id: string) => {
      setHiddenEdges((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        hiddenRef.current = next;
        if (model) setEdges(toEdges(model, viewRef.current, next));
        return next;
      });
    },
    [model, setEdges],
  );

  const onRelayout = useCallback(() => {
    void (async () => {
      const laid = await layoutNodes(nodes, edges);
      setNodes(laid);
    })();
  }, [nodes, edges, setNodes]);

  return (
    <SelectionContext.Provider value={setSelection}>
      <div className="cv-app">
        <Toolbar
          network={network}
          onNetwork={setNetwork}
          onLoad={onLoad}
          onDemo={onDemo}
          onPaste={() => {
            setPasteError(undefined);
            setPasteOpen(true);
          }}
          view={view}
          onView={changeView}
          status={status}
          model={model}
          initialContractId={initial.contractId === 'demo' ? '' : initial.contractId}
        />

        <div className="cv-body">
          {status === 'idle' && !model && (
            <div className="cv-empty">
              <p>Enter a data contract id and pick a network, paste contract JSON, or try the demo.</p>
              <button type="button" className="cv-primary" onClick={onDemo}>
                Load demo (dash-qa)
              </button>
            </div>
          )}
          {status === 'error' && (
            <div className="cv-empty cv-error-box" role="alert">
              <strong>Couldn’t load contract.</strong>
              <p>{errorMsg}</p>
            </div>
          )}
          {model && (
            <Canvas
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onRelayout={onRelayout}
              exportName={model.contractId ?? 'contract'}
            />
          )}
          {model && <ContractMetaPanel model={model} />}
          {model && selection && (
            <InspectorPanel
              selection={selection}
              model={model}
              hiddenEdges={hiddenEdges}
              onToggleEdge={toggleEdge}
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
