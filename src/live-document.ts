import { parse, serialize, defaultTreeAdapter as adapter, html } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { maxSnapshotBytes, type TextEntry } from './contracts.ts';
import { utf8Offsets } from './parser.ts';
import { liveBridge } from './live-bridge.ts';

export const sourceMarker = 'data-pagein-source';
type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : [];

// This serialization is only a disposable rendering projection. Export always
// uses Rust's original source bytes and verified patches, never this HTML.
export function buildLiveDocument(sourceWithBom: string, resourceBase: string, entries: TextEntry[],
  texts: Record<string, string>, channel: string, scroll: { x: number; y: number }) {
  const bom = sourceWithBom.startsWith('\uFEFF') ? 3 : 0;
  const source = bom ? sourceWithBom.slice(1) : sourceWithBom;
  const offsets = utf8Offsets(source);
  const byRange = new Map(entries.map(entry => [entry.nodeId, entry]));
  const tree = parse(source, { sourceCodeLocationInfo: true });
  let base = resourceBase;
  let seenBase = false;
  function visit(parent: Node) {
    for (const node of [...children(parent)]) {
      if (!('tagName' in node)) continue;
      node.attrs = node.attrs.filter(attr => attr.name !== sourceMarker);
      if (node.tagName === 'base' && !seenBase) {
        seenBase = true;
        try {
          const candidate = new URL(node.attrs.find(attr => attr.name === 'href')?.value ?? '', resourceBase);
          const root = new URL(resourceBase);
          if (candidate.origin === root.origin && candidate.protocol === root.protocol
            && candidate.host === root.host && candidate.pathname.startsWith(root.pathname)) base = candidate.href;
        } catch { /* Use the authorized resource root. */ }
      }
      if (['base', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet'].includes(node.tagName)
        || (node.tagName === 'meta' && node.attrs.some(attr => attr.name === 'http-equiv'))) {
        adapter.detachNode(node); continue;
      }
      // Match the static parser's safe multiline heading projection.
      if (/^(h[1-6]|p)$/.test(node.tagName)
        && node.childNodes.some(child => 'tagName' in child && child.tagName === 'br')
        && node.childNodes.every(child => child.nodeName === '#text' || ('tagName' in child && child.tagName === 'br'))) {
        for (const child of [...node.childNodes]) {
          if (!('value' in child) || !child.value.trim()) continue;
          const span = adapter.createElement('span', html.NS.HTML, []);
          adapter.insertBefore(node, span, child); adapter.detachNode(child); adapter.appendChild(span, child);
        }
      }
      const text = node.childNodes.length === 1 ? node.childNodes[0] : undefined;
      if (text?.nodeName === '#text' && 'value' in text && text.sourceCodeLocation) {
        const loc = text.sourceCodeLocation;
        const id = `${offsets[loc.startOffset] + bom}:${offsets[loc.endOffset] + bom}`;
        const entry = byRange.get(id);
        if (entry && entry.tag === node.tagName && entry.originalDecoded === text.value) {
          node.attrs.push({ name: sourceMarker, value: id });
          text.value = texts[id] ?? entry.originalDecoded;
        }
      }
      visit(node);
    }
  }
  visit(tree);
  const root = tree.childNodes.find(node => 'tagName' in node && node.tagName === 'html') as Element;
  const head = root.childNodes.find(node => 'tagName' in node && node.tagName === 'head') as Element;
  const baseNode = adapter.createElement('base', html.NS.HTML, [{ name: 'href', value: base }]);
  const bridge = adapter.createElement('script', html.NS.HTML, []);
  const config = JSON.stringify({ channel, scroll, maxBytes: maxSnapshotBytes }).replace(/</g, '\\u003c');
  adapter.insertText(bridge, `(${liveBridge.toString()})(${config});`);
  if (head.childNodes.length) {
    adapter.insertBefore(head, bridge, head.childNodes[0]); adapter.insertBefore(head, baseNode, bridge);
  } else { adapter.appendChild(head, baseNode); adapter.appendChild(head, bridge); }
  return serialize(tree);
}

export function mapLiveElements(doc: Document, entries: TextEntry[], texts: Record<string, string>) {
  const candidates = new Map<string, HTMLElement[]>();
  for (const element of doc.querySelectorAll<HTMLElement>(`[${sourceMarker}]`)) {
    const id = element.getAttribute(sourceMarker)!;
    candidates.set(id, [...(candidates.get(id) ?? []), element]);
  }
  const mapped = new Map<HTMLElement, TextEntry>();
  for (const entry of entries) {
    const matches = candidates.get(entry.nodeId);
    if (matches?.length !== 1) continue;
    const element = matches[0];
    if (element.namespaceURI === html.NS.HTML && element.localName === entry.tag
      && element.childNodes.length === 1 && element.firstChild?.nodeType === 3
      && element.textContent === (texts[entry.nodeId] ?? entry.originalDecoded)) mapped.set(element, entry);
  }
  return mapped;
}
