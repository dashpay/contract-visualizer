import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EntityNode } from './EntityNode';
import { ExternalNode } from './ExternalNode';
import { kindColor, type DiagramNode, type Filters } from './diagramToFlow';
import { exportDiagram } from './exportImage';
import { useSelect } from './selection';
import { REF_KIND_LABEL, type RefKind } from '../model/describe';
import type { Relationship } from '../model/types';

const nodeTypes = { entity: EntityNode, external: ExternalNode };

interface Props {
  nodes: DiagramNode[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<DiagramNode>[]) => void;
  onRelayout: () => Promise<void>;
  /** Changes whenever a new model is laid out; triggers one re-layout with measured sizes. */
  layoutKey: number;
  exportName: string;
  filters: Filters;
  onFilters: (f: Filters) => void;
  counts: { declared: number; inferred: number; platform: number };
  /** Compare mode: show the diff legend. */
  compare?: boolean;
  /** Center the view on this node; `n` changes on every request. */
  focus?: { id: string; n: number };
}

const LEGEND: RefKind[] = ['document', 'external', 'identity', 'key', 'contract', 'token'];

function Legend({ filters, onFilters, counts, compare }: Pick<Props, 'filters' | 'onFilters' | 'counts' | 'compare'>) {
  return (
    <div className="cv-legend">
      {compare && (
        <div className="cv-legend-kinds">
          <span className="cv-legend-kind">
            <span className="cv-legend-swatch" style={{ background: 'var(--diff-added)' }} />+ added
          </span>
          <span className="cv-legend-kind">
            <span className="cv-legend-swatch" style={{ background: 'var(--diff-removed)' }} />− removed
          </span>
          <span className="cv-legend-kind">
            <span className="cv-legend-swatch" style={{ background: 'var(--diff-changed)' }} />~ changed
          </span>
          <span className="cv-legend-kind">
            <span className="cv-refused-mark">✕</span> refused as an update
          </span>
        </div>
      )}
      <div className="cv-legend-kinds">
        {LEGEND.map((k) => (
          <span key={k} className="cv-legend-kind">
            <span className="cv-legend-swatch" style={{ background: kindColor(k) }} />
            {REF_KIND_LABEL[k]}
          </span>
        ))}
        <span className="cv-legend-kind">
          <span className="cv-legend-swatch cv-legend-dashed" />
          inferred from names
        </span>
      </div>
      <div className="cv-legend-filters">
        <label>
          <input type="checkbox" checked={filters.declared} onChange={(e) => onFilters({ ...filters, declared: e.target.checked })} />
          declared ({counts.declared})
        </label>
        <label>
          <input type="checkbox" checked={filters.inferred} onChange={(e) => onFilters({ ...filters, inferred: e.target.checked })} />
          inferred ({counts.inferred})
        </label>
        <label>
          <input type="checkbox" checked={filters.platform} onChange={(e) => onFilters({ ...filters, platform: e.target.checked })} />
          identities, keys, tokens ({counts.platform})
        </label>
      </div>
    </div>
  );
}

function CanvasInner({ nodes, edges, onNodesChange, onRelayout, layoutKey, exportName, filters, onFilters, counts, compare, focus }: Props) {
  const select = useSelect();
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const measuredFor = useRef<number | null>(null);
  const [fitPending, setFitPending] = useState(false);

  const relayoutAndFit = useCallback(() => {
    void onRelayout().then(() => setFitPending(true));
  }, [onRelayout]);

  // First paint uses estimated heights; once React Flow has measured the
  // nodes, lay out again with the real sizes.
  useEffect(() => {
    if (!initialized || measuredFor.current === layoutKey) return;
    measuredFor.current = layoutKey;
    relayoutAndFit();
  }, [initialized, layoutKey, relayoutAndFit]);

  // Fit once the laid-out positions have reached React Flow (its store syncs
  // from props in its own effects, which run before this parent effect).
  useEffect(() => {
    if (!fitPending) return;
    setFitPending(false);
    void fitView({ padding: 0.12 });
  }, [nodes, fitPending, fitView]);

  useEffect(() => {
    if (focus) void fitView({ nodes: [{ id: focus.id }], duration: 400, padding: 0.4, maxZoom: 1.1 });
  }, [focus, fitView]);

  const onEdgeClick = useCallback<EdgeMouseHandler<Edge>>(
    (_event, edge) => {
      const rel = (edge.data as { relationship?: Relationship } | undefined)?.relationship;
      if (rel) select({ kind: 'relationship', relationship: rel });
    },
    [select],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgeClick={onEdgeClick}
      onPaneClick={() => select(null)}
      nodeTypes={nodeTypes}
      nodesConnectable={false}
      fitView
      minZoom={0.05}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
      <Panel position="top-right" className="cv-canvas-panel">
        <button type="button" onClick={relayoutAndFit} title="Auto-arrange">
          re-layout
        </button>
        <button type="button" onClick={() => void exportDiagram('png', exportName)}>
          PNG
        </button>
        <button type="button" onClick={() => void exportDiagram('svg', exportName)}>
          SVG
        </button>
      </Panel>
      <Panel position="bottom-center">
        <Legend filters={filters} onFilters={onFilters} counts={counts} compare={compare} />
      </Panel>
    </ReactFlow>
  );
}

export function Canvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
