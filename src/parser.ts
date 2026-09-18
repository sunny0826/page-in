import { parse, parseFragment, serialize, defaultTreeAdapter as adapter, html } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { ParsedDocument, TextEntry } from './contracts.ts';
import { detectDocumentFormat } from './document-format.ts';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
const HTML_NS = html.NS.HTML;
const blocked = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base']);
const uneditable = new Set(['head', 'script', 'style', 'textarea', 'title', 'noscript', 'template', 'select', 'option']);
const children = (n: Node): Node[] => 'childNodes' in n ? n.childNodes : [];
const isElement = (n: Node): n is Element => 'tagName' in n;

export function utf8Offsets(text: string): Uint32Array {
  const offsets = new Uint32Array(text.length + 1);
  let byte = 0;
  for (let i = 0; i < text.length;) {
    const cp = text.codePointAt(i)!;
    const width = cp > 0xffff ? 2 : 1;
    offsets[i] = byte;
    if (width === 2) offsets[i + 1] = byte;
    byte += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    i += width;
    offsets[i] = byte;
  }
  return offsets;
}

export function parseDocument(sourceWithBom: string, resourceBase: string): ParsedDocument {
  const bom = sourceWithBom.startsWith('\uFEFF') ? 3 : 0;
  const source = bom ? sourceWithBom.slice(1) : sourceWithBom;
  const tree = parse(source, { sourceCodeLocationInfo: true, scriptingEnabled: true });
  const offsets = utf8Offsets(source);
  const warnings = new Set<string>();
  let base = resourceBase;
  let baseSeen = false;
  let count = 0;
  function sanitize(parent: Node) {
    for (const child of [...children(parent)]) {
      if (++count > 50000) throw new Error('最多处理 50,000 个节点');
      if (isElement(child)) {
        if (child.tagName === 'meta') {
          const charset = child.attrs.find(a => a.name === 'charset')?.value;
          const contentType = child.attrs.find(a => a.name === 'http-equiv')?.value.toLowerCase() === 'content-type';
          const declared = charset || (contentType ? child.attrs.find(a => a.name === 'content')?.value.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] : undefined);
          if (declared && !['utf-8', 'utf8', 'us-ascii'].includes(declared.toLowerCase())) {
            throw new Error('只支持 UTF-8；该文件声明了其他编码，未修改原文件');
          }
        }
        if (child.tagName === 'base' && !baseSeen) {
          baseSeen = true;
          const href = child.attrs.find(a => a.name === 'href')?.value;
          if (href) {
            const target = new URL(href, resourceBase);
            if (target.protocol === new URL(resourceBase).protocol && target.host === new URL(resourceBase).host && target.pathname.startsWith(new URL(resourceBase).pathname)) base = target.href;
            else warnings.add('外部或越界 base 不受支持');
          }
        }
        if (blocked.has(child.tagName) || (child.tagName === 'meta' && child.attrs.some(a => a.name === 'http-equiv'))) {
          adapter.detachNode(child);
          continue;
        }
        child.attrs = child.attrs.filter(a => !a.name.startsWith('on') && !['srcdoc', 'autofocus', 'contenteditable'].includes(a.name) && !/^\s*javascript:/i.test(a.value));
        // Declarative shadow roots and templates have no editable source mapping in T1.
        if (child.tagName === 'template') { adapter.detachNode(child); continue; }
      }
      sanitize(child);
    }
  }
  sanitize(tree);
  const format = detectDocumentFormat(tree);
  // Removing scripts can leave adjacent Text nodes. HTML serialization joins
  // them, so normalize before recording DOM paths. A joined range crosses
  // removed source markup and must never become an editable source interval.
  function normalizeText(parent: Node) {
    let previous: Node | undefined;
    for (const child of [...children(parent)]) {
      if (child.nodeName === '#text' && 'value' in child && previous?.nodeName === '#text' && 'value' in previous) {
        previous.value += child.value;
        delete previous.sourceCodeLocation;
        adapter.detachNode(child);
      } else {
        normalizeText(child);
        previous = child;
      }
    }
  }
  normalizeText(tree);
  // Keep explicit line breaks in deck headings. Only wrap their individual text
  // runs in the preview; each patch still targets the original text bytes.
  function wrapLines(parent: Node) {
    if (isElement(parent) && /^(h[1-6]|p)$/.test(parent.tagName)
      && parent.childNodes.some(n => isElement(n) && n.tagName === 'br')
      && parent.childNodes.every(n => n.nodeName === '#text' || (isElement(n) && n.tagName === 'br'))) {
      for (const child of [...parent.childNodes]) {
        if (child.nodeName !== '#text' || !('value' in child) || !child.value.trim()) continue;
        const span = adapter.createElement('span', HTML_NS, []);
        adapter.insertBefore(parent, span, child);
        adapter.detachNode(child);
        adapter.appendChild(span, child);
      }
    }
    children(parent).forEach(wrapLines);
  }
  wrapLines(tree);
  const html = children(tree).find(n => isElement(n) && n.tagName === 'html') as Element;
  const head = children(html).find(n => isElement(n) && n.tagName === 'head') as Element;
  const policy = adapter.createElement('meta', HTML_NS, [
    { name: 'http-equiv', value: 'Content-Security-Policy' },
    { name: 'content', value: "default-src 'none'; script-src 'none'; style-src 'unsafe-inline' pagein-resource: http://pagein-resource.localhost; img-src data: pagein-resource: http://pagein-resource.localhost; font-src data: pagein-resource: http://pagein-resource.localhost; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri pagein-resource: http://pagein-resource.localhost" },
  ]);
  const baseNode = adapter.createElement('base', HTML_NS, [{ name: 'href', value: base }]);
  if (head.childNodes.length) adapter.insertBefore(head, policy, head.childNodes[0]); else adapter.appendChild(head, policy);
  adapter.insertBefore(head, baseNode, head.childNodes[1] ?? policy);
  const entries: TextEntry[] = [];
  function visit(n: Node, path: number[], excluded: boolean) {
    const skip = excluded || (isElement(n) && (uneditable.has(n.tagName) || n.namespaceURI !== HTML_NS));
    if (!skip && isElement(n) && n.childNodes.length === 1) {
      const text = n.childNodes[0];
      if (text.nodeName === '#text' && 'value' in text && text.value.trim() && text.sourceCodeLocation) {
        const loc = text.sourceCodeLocation;
        const raw = source.slice(loc.startOffset, loc.endOffset);
        const check = parseFragment(raw).childNodes;
        if (check.length === 1 && check[0].nodeName === '#text' && 'value' in check[0] && check[0].value === text.value && !raw.includes('\0')) {
          const startByte = offsets[loc.startOffset] + bom;
          const endByte = offsets[loc.endOffset] + bom;
          entries.push({ nodeId: `${startByte}:${endByte}`, startByte, endByte, raw, originalDecoded: text.value, domPath: path, tag: n.tagName });
        }
      }
    }
    children(n).forEach((child, index) => visit(child, [...path, index], skip));
  }
  visit(tree, [], false);
  entries.sort((a, b) => a.startByte - b.startByte);
  let end = 0;
  const safe = entries.filter(e => {
    if (e.startByte < end) return false;
    end = e.endByte;
    return true;
  });
  if (safe.length === 0) warnings.add('没有找到可安全编辑的纯文本元素');
  return { format, html: serialize(tree), entries: safe, warnings: [...warnings] };
}
