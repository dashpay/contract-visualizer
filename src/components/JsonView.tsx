import { useMemo, useRef, useState } from 'react';
import { tokenizeJson } from '../model/jsonTokens';

/**
 * The JSON of a document type, an index or a property as the contract
 * writes it, collapsed until opened, with a copy button.
 */
export function JsonView({ value, title, note }: { value: unknown; title: string; note?: string }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const tokens = useMemo(() => tokenizeJson(text), [text]);
  const [copied, setCopied] = useState(false);
  const code = useRef<HTMLElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard access: select the text for a manual copy.
      const node = code.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };

  return (
    <details className="cv-json">
      <summary>
        {title}
        {note && <span className="cv-muted"> · {note}</span>}
      </summary>
      <div className="cv-json-body">
        <button type="button" className="cv-json-copy" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre className="cv-json-code">
          <code ref={code}>
            {tokens.map((token, i) =>
              token.kind === 'plain' ? (
                token.text
              ) : (
                <span key={i} className={`cv-json-${token.kind}`}>
                  {token.text}
                </span>
              ),
            )}
          </code>
        </pre>
      </div>
    </details>
  );
}
