import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEdgesState, useNodesState, type Edge } from '@xyflow/react';
import { loadConfig, saveOverride, type Network, type ViewKind } from './config';
import { loadContractJson } from './sdk/contract';
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
import { ChangesPanel } from './components/ChangesPanel';
import { LayoutPanel } from './components/LayoutPanel';
import { CompareModal, type CompareSpec } from './components/CompareModal';
import { EXAMPLES, exampleId, exampleKey } from './examples';
import { fileLabel, looksLikeUrl, urlFromSource, urlSourceId } from './urlSource';
import { diffContracts, type Change, type ContractDiff } from './model/diff';
import { loadPr, parsePrUrl } from './github';
import { truncateMiddle } from './format';

const initial = loadConfig();

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** A source as typed in the compare dialog -> a loader source id. */
function toSourceId(typed: string): string {
  const t = typed.trim();
  if (looksLikeUrl(t)) return urlSourceId(t);
  return t;
}

/** A short label for a source as typed. */
function sourceLabel(typed: string, net: Network): string {
  const t = typed.trim();
  if (!t) return '(none: an empty contract)';
  const key = exampleKey(t);
  if (key) return `example ${key}`;
  if (looksLikeUrl(t)) {
    const m = t.match(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([0-9a-f]{7})[0-9a-f]*\//);
    return `${fileLabel(t) ?? t}${m ? ` @ ${m[1]}` : ''}`;
  }
  return `${truncateMiddle(t, 6, 6)} on ${net}`;
}

const EMPTY_CONTRACT = { documentSchemas: {} };

export default function App() {
  const [network, setNetwork] = useState<Network>(initial.network);
  const [devnetName, setDevnetName] = useState(initial.devnetName ?? '');
  const [view, setView] = useState<ViewKind>(initial.view);
  const [contractInput, setContractInput] = useState(
    exampleKey(initial.contractId) ? '' : (urlFromSource(initial.contractId) ?? initial.contractId),
  );
  const [source, setSource] = useState('');
  const [model, setModel] = useState<ContractModel | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hiddenEdges, setHiddenEdges] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selection, setSelection] = useState<Selection>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteError, setPasteError] = useState<string | undefined>(undefined);
  const [layoutKey, setLayoutKey] = useState(0);
  const [diff, setDiff] = useState<ContractDiff | null>(null);
  const [compareSpec, setCompareSpec] = useState<CompareSpec | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareError, setCompareError] = useState<string | undefined>(undefined);
  const [compareInitialPr, setCompareInitialPr] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState<{ id: string; n: number } | undefined>(undefined);
  const [layoutView, setLayoutView] = useState<{ documentType: string; json: unknown } | null>(null);
  // The JSON of the contract on screen (both sides in compare mode), for the GroveDB layout panel.
  const contractJsonRef = useRef<unknown>(null);
  const compareJsonRef = useRef<{ base: unknown; head: unknown } | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Refs so the async layout/setters read current state without re-creating callbacks.
  const viewRef = useRef(view);
  const hiddenRef = useRef(hiddenEdges);
  const filtersRef = useRef(filters);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const diffRef = useRef(diff);
  diffRef.current = diff;
  viewRef.current = view;
  hiddenRef.current = hiddenEdges;
  filtersRef.current = filters;
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const updateUrl = useCallback((source: string, net: Network, devnet: string, v: ViewKind) => {
    const p = new URLSearchParams();
    const key = exampleKey(source);
    const url = urlFromSource(source);
    if (key) p.set('example', key);
    else if (url) p.set('url', url);
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
      const d = diffRef.current ?? undefined;
      const es = toEdges(m, viewRef.current, hiddenRef.current, filtersRef.current, d);
      const built = toNodes(m, viewRef.current, es, d, filtersRef.current);
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
    async (m: ContractModel, source: string, net: Network, devnet: string, json: unknown) => {
      contractJsonRef.current = json;
      compareJsonRef.current = null;
      setDiff(null);
      diffRef.current = null;
      setCompareSpec(null);
      setModel(m);
      setSource(source);
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
        const json = await loadContractJson({ network: net, contractId: source, devnetName: devnet || undefined, view: viewRef.current });
        const m = withRelationships(modelFromPastedJson(json));
        saveOverride({ network: net, contractId: source, devnetName: devnet || undefined });
        await applyModel(m, source, net, devnet, json);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [applyModel],
  );

  const runCompare = useCallback(
    async (spec: CompareSpec, net: Network, devnet: string) => {
      const hadModel = !!diffRef.current || nodesRef.current.length > 0;
      setStatus('loading');
      setErrorMsg(null);
      setCompareError(undefined);
      try {
        const load1 = (typed: string) =>
          typed.trim()
            ? loadContractJson({ network: net, contractId: toSourceId(typed), devnetName: devnet || undefined, view: viewRef.current })
            : Promise.resolve(EMPTY_CONTRACT);
        const [b, h] = await Promise.all([load1(spec.base), load1(spec.head)]);
        const d = diffContracts(b, h);
        compareJsonRef.current = { base: b, head: h };
        setDiff(d);
        diffRef.current = d;
        setCompareSpec(spec);
        setModel(d.merged);
        setSource('');
        setSelection(null);
        const nextHidden = new Set<string>();
        setHiddenEdges(nextHidden);
        hiddenRef.current = nextHidden;
        await rebuild(d.merged, true);
        setStatus('ready');
        setCompareOpen(false);
        const p = new URLSearchParams();
        if (spec.pr) {
          p.set('pr', spec.pr.url);
          p.set('file', spec.pr.file);
        } else {
          p.set('base', spec.base);
          p.set('head', spec.head);
          const usesId = [spec.base, spec.head].some((t) => t && !looksLikeUrl(t) && !exampleKey(t));
          if (usesId) {
            p.set('network', net);
            if (net === 'devnet' && devnet) p.set('devnet', devnet);
          }
        }
        p.set('view', viewRef.current);
        window.history.replaceState(null, '', `?${p.toString()}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setCompareError(msg);
        if (!compareOpenRef.current) {
          setErrorMsg(msg);
          setStatus('error');
        } else {
          setStatus(hadModel ? 'ready' : 'idle');
        }
      }
    },
    [rebuild],
  );
  const compareOpenRef = useRef(compareOpen);
  compareOpenRef.current = compareOpen;

  // Initial load from URL/localStorage/env.
  useEffect(() => {
    const c = initial.compare;
    const net = initial.network;
    const devnet = initial.devnetName ?? '';
    if (c && 'pr' in c) {
      const ref = parsePrUrl(c.pr);
      if (c.file && ref) {
        setStatus('loading');
        void loadPr(ref)
          .then((pr) => {
            const f = pr.files.find((x) => x.path === c.file);
            if (!f) throw new Error(`${c.file} is not a changed JSON file of ${pr.url}.`);
            return runCompare({ base: f.baseUrl ?? '', head: f.headUrl ?? '', pr: { url: pr.url, file: f.path, title: pr.title } }, net, devnet);
          })
          .catch((err) => {
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setStatus('error');
          });
      } else {
        setCompareInitialPr(c.pr);
        setCompareOpen(true);
      }
      return;
    }
    if (c) {
      void runCompare({ base: c.base, head: c.head }, net, devnet);
      return;
    }
    if (initial.contractId) void load(initial.contractId, net, devnet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectChange = useCallback(
    (c: Change) => {
      const d = diffRef.current;
      if (!d || !c.entity) {
        setSelection(null);
        return;
      }
      const entity = d.merged.entities.find((e) => e.name === c.entity);
      if (!entity) return;
      if (c.scope === 'field') {
        const field = entity.fields.find((f) => f.path === c.target);
        setSelection(field ? { kind: 'field', entity, field } : { kind: 'entity', entity });
      } else if (c.scope === 'index') {
        const index = entity.indices.find((i) => i.name === c.target);
        setSelection(index ? { kind: 'index', entity, index } : { kind: 'entity', entity });
      } else if (c.scope === 'rule' && c.target) {
        setSelection({ kind: 'constraint', entity, name: c.target, rule: entity.propertyConstraints[c.target] });
      } else {
        setSelection({ kind: 'entity', entity });
      }
      setFocus((f) => ({ id: entity.name, n: (f?.n ?? 0) + 1 }));
    },
    [],
  );

  const exitCompare = useCallback(() => {
    const d = diffRef.current;
    const spec = compareSpec;
    if (!d) return;
    const headSource = spec?.head ? toSourceId(spec.head) : '';
    void applyModel(d.head, headSource, network, devnetName, compareJsonRef.current?.head ?? null);
    if (spec?.head) setContractInput(spec.head);
  }, [applyModel, compareSpec, network, devnetName]);

  // A link in the contract id box loads that JSON file instead of a registered contract.
  const onLoad = useCallback(
    (id: string) => void load(looksLikeUrl(id) ? urlSourceId(id) : id, network, devnetName),
    [load, network, devnetName],
  );
  const onExample = useCallback((key: string) => void load(exampleId(key), network, devnetName), [load, network, devnetName]);
  const onOpenContract = useCallback(
    (id: string) => {
      setContractInput(id);
      void load(id, network, devnetName);
    },
    [load, network, devnetName],
  );

  /** Open the GroveDB layout of a document type: the head's version in compare mode, else the base's. */
  const openLayout = useCallback((documentType: string) => {
    const compare = compareJsonRef.current;
    const d = diffRef.current;
    const json = compare && d
      ? d.head.entities.some((e) => e.name === documentType)
        ? compare.head
        : compare.base
      : contractJsonRef.current;
    if (json) setLayoutView({ documentType, json });
  }, []);

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
        void applyModel(m, '', network, devnetName, parsed);
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
          onCompare={() => {
            setCompareError(undefined);
            setCompareInitialPr(undefined);
            setCompareOpen(true);
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
                  : 'Enter a data contract id and pick a network, paste contract JSON, open an example, or compare two versions.'}
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
              exportName={
                diff && compareSpec
                  ? `${fileLabel(compareSpec.head) ?? model.contractId ?? 'contract'}-diff`
                  : (model.contractId ?? fileLabel(urlFromSource(source) ?? '') ?? 'contract')
              }
              filters={filters}
              onFilters={changeFilters}
              counts={counts}
              compare={!!diff}
              focus={focus}
            />
          )}
          {model && status !== 'error' && !diff && <ContractMetaPanel model={model} />}
          {model && status !== 'error' && diff && compareSpec && (
            <ChangesPanel
              diff={diff}
              baseLabel={sourceLabel(compareSpec.base, network)}
              headLabel={sourceLabel(compareSpec.head, network)}
              pr={compareSpec.pr}
              onlyChanged={filters.onlyChanged}
              onOnlyChanged={(v) => changeFilters({ ...filters, onlyChanged: v })}
              onSelect={onSelectChange}
              onExit={exitCompare}
            />
          )}
          {model && selection && status !== 'error' && (
            <InspectorPanel
              selection={selection}
              model={model}
              hiddenEdges={hiddenEdges}
              onToggleEdge={toggleEdge}
              onOpenContract={onOpenContract}
              onClose={() => setSelection(null)}
              diff={diff ?? undefined}
              onShowLayout={openLayout}
            />
          )}
        </div>

        {layoutView && (
          <LayoutPanel documentType={layoutView.documentType} contractJson={layoutView.json} onClose={() => setLayoutView(null)} />
        )}
        {pasteOpen && (
          <PasteContractModal onApply={applyPaste} onClose={() => setPasteOpen(false)} error={pasteError} />
        )}
        {compareOpen && (
          <CompareModal
            initial={compareSpec ?? { base: diff ? '' : contractInput, head: '' }}
            initialPr={compareInitialPr}
            onCompare={(spec) => void runCompare(spec, network, devnetName)}
            onClose={() => setCompareOpen(false)}
            error={compareError}
          />
        )}
      </div>
    </SelectionContext.Provider>
  );
}
