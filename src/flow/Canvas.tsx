import { useCallback } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { EntityNode } from './EntityNode';
import type { EntityNodeData } from './diagramToFlow';
import { exportDiagram } from './exportImage';
import { useSelect } from './selection';
import type { Relationship } from '../model/types';

const nodeTypes = { entity: EntityNode };

interface Props {
  nodes: Node<EntityNodeData>[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange<Node<EntityNodeData>>[]) => void;
  onRelayout: () => void;
  exportName: string;
}

function CanvasInner({ nodes, edges, onNodesChange, onRelayout, exportName }: Props) {
  const select = useSelect();

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
      fitView
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
      <Panel position="top-right" className="cv-canvas-panel">
        <button type="button" onClick={onRelayout} title="Auto-arrange">
          re-layout
        </button>
        <button type="button" onClick={() => void exportDiagram('png', exportName)}>
          PNG
        </button>
        <button type="button" onClick={() => void exportDiagram('svg', exportName)}>
          SVG
        </button>
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
