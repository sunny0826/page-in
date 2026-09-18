import type { ParsedDocument, TextEntry } from './contracts.ts';
import { t } from './i18n.ts';
import { stylePageScrollbars } from './page-scrollbars.ts';

export async function parseInWorker(source: string, resourceBase: string): Promise<ParsedDocument> {
  const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
  let timeout: ReturnType<typeof setTimeout>;
  try {
    return await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(t('parseTimeout'))), 15000);
      worker.onmessage = ({ data }) => data.ok ? resolve(data.result) : reject(new Error(data.error));
      worker.onerror = event => reject(new Error(event.message));
      worker.postMessage({ source, resourceBase });
    });
  } finally { clearTimeout(timeout!); worker.terminate(); }
}
export function mapElements(doc: Document, entries: TextEntry[]) {
  const elements = new Map<HTMLElement, TextEntry>();
  for (const entry of entries) {
    let node: Node | undefined = doc;
    for (const index of entry.domPath) node = node?.childNodes[index];
    if (node?.nodeType === Node.ELEMENT_NODE && (node as Element).localName === entry.tag
      && node.textContent === entry.originalDecoded && node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE) {
      elements.set(node as HTMLElement, entry);
    }
  }
  return elements;
}
export async function loadFrame(frame: HTMLIFrameElement, html: string) {
  let timeout: ReturnType<typeof setTimeout>;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error(t('renderTimeout'))), 10000);
      frame.onload = () => resolve();
      frame.srcdoc = html;
    });
  } finally { clearTimeout(timeout!); frame.onload = null; }
  const doc = frame.contentDocument;
  if (!doc) throw new Error(t('frameUnavailable'));
  frame.hidden = false;
  // Hidden iframe documents can return empty computed styles in WebKit.
  stylePageScrollbars(doc);
  return doc;
}
