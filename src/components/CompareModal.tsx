import { useEffect, useState } from 'react';
import { loadPr, parsePrUrl, type PrInfo } from '../github';

export interface CompareSpec {
  /** Sources as typed: a contract id, a link, 'example:<key>', or '' for none (an empty contract). */
  base: string;
  head: string;
  pr?: { url: string; file: string; title?: string };
}

interface Props {
  initial: CompareSpec;
  /** Open with this pull request's files listed. */
  initialPr?: string;
  onCompare: (spec: CompareSpec) => void;
  onClose: () => void;
  error?: string;
}

/** Contract files first: a path mentioning "contract", then the rest. */
function sortFiles(files: PrInfo['files']) {
  const score = (p: string) => (/contract/i.test(p) ? 0 : 1);
  return [...files].sort((a, b) => score(a.path) - score(b.path) || a.path.localeCompare(b.path));
}

export function CompareModal({ initial, initialPr, onCompare, onClose, error }: Props) {
  const [base, setBase] = useState(initial.base);
  const [head, setHead] = useState(initial.head);
  const [prUrl, setPrUrl] = useState(initialPr ?? initial.pr?.url ?? '');
  const [pr, setPr] = useState<PrInfo | null>(null);
  const [file, setFile] = useState(initial.pr?.file ?? '');
  const [prState, setPrState] = useState<{ loading: boolean; error?: string }>({ loading: false });

  const listFiles = async (url: string) => {
    const ref = parsePrUrl(url);
    if (!ref) {
      setPrState({ loading: false, error: 'Not a GitHub pull request link (github.com/<owner>/<repo>/pull/<n>).' });
      return;
    }
    setPrState({ loading: true });
    try {
      const info = await loadPr(ref);
      setPr(info);
      setPrState({ loading: false, error: info.files.length ? undefined : 'This pull request changes no JSON file.' });
      const files = sortFiles(info.files);
      const contracts = files.filter((f) => /contract/i.test(f.path));
      const pick = files.find((f) => f.path === file) ?? (contracts.length === 1 ? contracts[0] : undefined);
      if (pick) choose(info, pick.path);
    } catch (err) {
      setPrState({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const choose = (info: PrInfo, path: string) => {
    const f = info.files.find((x) => x.path === path);
    if (!f) return;
    setFile(path);
    setBase(f.baseUrl ?? '');
    setHead(f.headUrl ?? '');
  };

  useEffect(() => {
    if (initialPr) void listFiles(initialPr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prSpec = pr && file ? { url: pr.url, file, title: pr.title } : undefined;

  return (
    <div className="cv-modal-scrim" onClick={onClose}>
      <div className="cv-modal cv-compare" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Compare two contract versions">
        <div className="cv-modal-head">
          <h2>Compare two contract versions</h2>
          <button type="button" className="cv-inspector-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="cv-compare-section">
          <label htmlFor="cv-pr">From a GitHub pull request</label>
          <form
            className="cv-compare-row"
            onSubmit={(e) => {
              e.preventDefault();
              void listFiles(prUrl);
            }}
          >
            <input
              id="cv-pr"
              type="text"
              className="cv-mono"
              placeholder="https://github.com/<owner>/<repo>/pull/<n>"
              value={prUrl}
              spellCheck={false}
              onChange={(e) => setPrUrl(e.target.value)}
            />
            <button type="submit" disabled={!prUrl.trim() || prState.loading}>
              {prState.loading ? 'Loading…' : 'List files'}
            </button>
          </form>
          {prState.error && <p className="cv-error">{prState.error}</p>}
          {pr && pr.files.length > 0 && (
            <div className="cv-compare-files" role="radiogroup" aria-label="Changed JSON files">
              <p className="cv-muted">
                {pr.title} · base {pr.baseSha.slice(0, 7)} (merge base) → head {pr.headSha.slice(0, 7)}
              </p>
              {sortFiles(pr.files).map((f) => (
                <label key={f.path} className="cv-compare-file">
                  <input type="radio" name="cv-pr-file" checked={file === f.path} onChange={() => choose(pr, f.path)} />
                  <span className={`cv-file-status cv-file-${f.status}`}>{f.status}</span>
                  <span className="cv-mono">{f.path}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="cv-compare-section">
          <label htmlFor="cv-base">Base (before)</label>
          <input
            id="cv-base"
            type="text"
            className="cv-mono"
            placeholder="contract id, link to contract JSON, example:<key>, or empty for none"
            value={base}
            spellCheck={false}
            onChange={(e) => setBase(e.target.value)}
          />
          <div className="cv-compare-swap">
            <button
              type="button"
              onClick={() => {
                setBase(head);
                setHead(base);
              }}
              title="Swap base and head"
            >
              ⇅ swap
            </button>
          </div>
          <label htmlFor="cv-head">Head (after)</label>
          <input
            id="cv-head"
            type="text"
            className="cv-mono"
            placeholder="contract id, link to contract JSON, example:<key>"
            value={head}
            spellCheck={false}
            onChange={(e) => setHead(e.target.value)}
          />
          <p className="cv-muted">
            A contract id is fetched from the network selected in the toolbar. Tip: base = the registered contract id,
            head = the JSON file of the proposed update.
          </p>
        </div>

        {error && <p className="cv-error">{error}</p>}
        <div className="cv-modal-actions">
          <button
            type="button"
            className="cv-primary"
            disabled={!head.trim() && !base.trim()}
            onClick={() => onCompare({ base: base.trim(), head: head.trim(), pr: prSpec && prSpec.file ? prSpec : undefined })}
          >
            Compare
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
