import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ExternalNodeData } from './diagramToFlow';
import { kindColor } from './diagramToFlow';
import { useSelect } from './selection';
import { truncateMiddle } from '../format';
import type { RefKind } from '../model/describe';
import { SYSTEM_CONTRACT_NAMES } from '../examples';

const KIND: Record<ExternalNodeData['node']['kind'], RefKind> = {
  identity: 'identity',
  contract: 'contract',
  token: 'token',
  identityPublicKey: 'key',
  externalDocument: 'external',
};

function ExternalNodeImpl({ data }: NodeProps) {
  const { node, incoming, status } = data as ExternalNodeData;
  const select = useSelect();
  const color = kindColor(KIND[node.kind]);
  return (
    <button
      type="button"
      className={`cv-external ${status ? `cv-external-${status}` : ''}`}
      style={{ borderColor: color }}
      onClick={(e) => {
        e.stopPropagation();
        select({ kind: 'external', node });
      }}
    >
      <Handle type="target" position={Position.Left} id="in" className="cv-handle" style={{ background: color }} />
      <span className="cv-external-stereo" style={{ color }}>
        {node.kind === 'externalDocument' ? '«other contract»' : '«platform»'}
      </span>
      <span className="cv-external-label">{node.label}</span>
      {node.contractId && (
        <span className="cv-external-sub cv-mono" title={node.contractId}>
          {SYSTEM_CONTRACT_NAMES[node.contractId] ?? truncateMiddle(node.contractId, 6, 6)}
        </span>
      )}
      <span className="cv-external-count">{incoming} ref{incoming === 1 ? '' : 's'}</span>
    </button>
  );
}

export const ExternalNode = memo(ExternalNodeImpl);
