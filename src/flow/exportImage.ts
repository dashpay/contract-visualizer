import { toPng, toSvg } from 'html-to-image';

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/** Capture the React Flow viewport (all nodes at current zoom) to PNG or SVG. */
export async function exportDiagram(format: 'png' | 'svg', name = 'contract'): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) return;
  const opts = { backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff' };
  const dataUrl = format === 'png' ? await toPng(viewport, opts) : await toSvg(viewport, opts);
  download(dataUrl, `${name}.${format}`);
}
