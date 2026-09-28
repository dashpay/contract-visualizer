import { useState } from 'react';

interface Props {
  onApply: (json: string) => void;
  onClose: () => void;
  error?: string;
}

export function PasteContractModal({ onApply, onClose, error }: Props) {
  const [text, setText] = useState('');

  return (
    <div className="cv-modal-scrim" onClick={onClose}>
      <div className="cv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Paste contract JSON">
        <div className="cv-modal-head">
          <h2>Paste contract JSON</h2>
          <button type="button" className="cv-inspector-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="cv-muted">
          Paste a full contract (with a <code>documentSchemas</code> block) or a bare{' '}
          <code>{'{ docType: { properties, indices } }'}</code> map. Nothing is sent anywhere: this is parsed locally. For a file on the web,
          put its link in the contract id box instead (or open <code>?url=&lt;link&gt;</code>).
        </p>
        <textarea
          className="cv-mono"
          value={text}
          spellCheck={false}
          placeholder='{ "testCase": { "properties": { … }, "indices": [ … ] } }'
          onChange={(e) => setText(e.target.value)}
        />
        {error && <p className="cv-error">{error}</p>}
        <div className="cv-modal-actions">
          <button type="button" className="cv-primary" disabled={!text.trim()} onClick={() => onApply(text)}>
            Render
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
