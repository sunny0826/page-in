import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { parse, serialize } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { parseDocument } from '../src/parser.ts';
import { buildLiveDocument, mapLiveElements, sourceMarker } from '../src/live-document.ts';
import { liveBridge } from '../src/live-bridge.ts';

const base = 'pagein-resource://localhost/session/';
type Node = DefaultTreeAdapterTypes.Node;
const all = (node: Node): Node[] => [node, ...('childNodes' in node ? node.childNodes.flatMap(all) : [])];
// Run the production capture handler against an HTML-parser-backed DOM clone.
// In particular, snapshot serialization is separate from parsing the live wire.
function captureSnapshot(html: string): string {
  const live = parse(html);
  const original = serialize(live);
  const handlers = new Map<string, (event: unknown) => void>();
  const replies: { type: string; html: string }[] = [];
  const parent = { postMessage: (value: typeof replies[number]) => replies.push(value) };
  const document = {
    querySelectorAll: () => [], createElement: () => ({ textContent: '' }),
    documentElement: { cloneNode() {
      const copy = structuredClone(live);
      return {
        get outerHTML() { return serialize(copy).replace(/^<!DOCTYPE html>/i, ''); },
        querySelector: () => null,
        querySelectorAll(selector: string) {
          return all(copy).filter(node => 'tagName' in node && selector.split(', ').includes(node.tagName)).map(node => {
            assert('tagName' in node);
            const text = node.childNodes[0];
            return {
              namespaceURI: node.namespaceURI,
              firstChild: text && 'value' in text ? {
                nodeType: 3, get data() { return text.value; }, set data(value: string) { text.value = value; },
              } : null,
              remove() { if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node); },
            };
          });
        },
      };
    } },
  };
  runInNewContext(`(${liveBridge.toString()})({ channel: 'test', maxBytes: 1e6, scroll: { x: 0, y: 0 } })`, {
    document, parent, TextEncoder, scrollX: 0, scrollY: 0,
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
  });
  handlers.get('message')!({ source: parent, data: { channel: 'test', type: 'capture', id: 'capture' } });
  assert.equal(replies[0]?.type, 'snapshot');
  assert.equal(serialize(live), original, 'capture only modifies the clone');
  return replies[0].html;
}
test('reports run scripts but metadata and existing presentations stay on their static path', () => {
  assert.equal(parseDocument('<p>Report</p><script src="app.js"></script>', base).live, true);
  assert.equal(parseDocument('<p>Report</p><script type="application/ld+json">{}</script>', base).live, false);
  assert.equal(parseDocument('<div id="deck"><section><p>Slide</p></section></div><script>start()</script>', base).live, false);
});
test('live projection preserves script order, scoped resources, original IDs and acknowledged text', () => {
  const source = '\uFEFF<head><link rel="stylesheet" href="css/style.css"></head><body><h1>中文 &amp; 😀</h1><div id="chart"></div><script src="js/data.js"></script><script>draw()</script></body>';
  const parsed = parseDocument(source, base);
  const entry = parsed.entries[0];
  const live = buildLiveDocument(source, base, parsed.entries, { [entry.nodeId]: '修改 <b> & 😀' }, 'channel', { x: 0, y: 300 });
  const nodes = all(parse(live));
  const scripts = nodes.filter(n => 'tagName' in n && n.tagName === 'script');
  assert.equal(scripts.length, 3);
  assert(live.includes('修改 &lt;b&gt; &amp; 😀'));
  assert(live.indexOf('js/data.js') < live.indexOf('draw()'));
  assert(live.includes(`href="${base}"`));
  assert(live.includes(`${sourceMarker}="${entry.nodeId}"`));
  assert.equal(entry.raw, '中文 &amp; 😀');
  assert(!parsed.html.includes('draw()'));
});
test('render projection discards source-provided markers and navigation containers', () => {
  const source = '<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example"><iframe src="https://evil.example"></iframe><div data-pagein-source="fake"><i>x</i></div><script>draw()</script>';
  const parsed = parseDocument(source, base);
  const live = buildLiveDocument(source, base, parsed.entries, {}, '</script><script>bad()</script>', { x: 0, y: 0 });
  assert(!live.includes('https://evil.example'));
  assert(!live.includes('data-pagein-source="fake"'));
  assert(!live.includes('</script><script>bad()'));
  assert(live.includes('<script>draw()</script>'));
});
test('snapshot is re-sanitized and never changes the original source manifest', () => {
  const source = '<h1>Original</h1><div id="chart"></div><script>draw()</script>';
  const original = parseDocument(source, base);
  const snapshot = `<h1 data-pagein-source="${original.entries[0].nodeId}">Original</h1><svg><text>Generated</text></svg><img src="data:image/png;base64,AA"><script>attack()</script><p onclick="attack()">Generated text</p>`;
  const clean = parseDocument(snapshot, base);
  assert(!clean.html.includes('attack()'));
  assert(clean.html.includes('<svg>'));
  assert(clean.html.includes('data:image/png'));
  assert.equal(original.entries.length, 1);
  assert.equal(Buffer.from(source).subarray(original.entries[0].startByte, original.entries[0].endByte).toString(), 'Original');
});

test('live mapping rejects duplicate, generated, transformed and structurally changed text', () => {
  const { entries } = parseDocument('<p>Original</p>', base);
  const entry = entries[0];
  const element = (overrides = {}) => ({
    getAttribute: () => entry.nodeId, namespaceURI: 'http://www.w3.org/1999/xhtml',
    localName: 'p', childNodes: [{}], firstChild: { nodeType: 3 }, textContent: 'Edited', ...overrides,
  }) as unknown as HTMLElement;
  const map = (elements: HTMLElement[]) => mapLiveElements({ querySelectorAll: () => elements } as unknown as Document,
    entries, { [entry.nodeId]: 'Edited' });
  const valid = element();
  assert.equal(map([valid]).get(valid), entry);
  assert.equal(map([valid, element()]).size, 0);
  for (const invalid of [
    element({ getAttribute: () => 'generated' }), element({ localName: 'span' }),
    element({ namespaceURI: 'http://www.w3.org/2000/svg' }), element({ textContent: 'script transformed' }),
    element({ childNodes: [{}, {}] }), element({ firstChild: { nodeType: 1 } }),
  ]) assert.equal(map([invalid]).size, 0);
});

test('live pre/listing replacements keep leading LF through preview and sanitized snapshot', () => {
  for (const tag of ['pre', 'listing']) {
    for (const prefix of ['', '\n', '\r\n', '\r', '&#10;']) {
      const source = `<${tag}>${prefix}Original</${tag}><script>draw()</script>`;
      const parsed = parseDocument(source, base);
      const entry = parsed.entries[0];
      const text = '\n\n新 <&> 😀';
      const live = buildLiveDocument(source, base, parsed.entries, { [entry.nodeId]: text }, 'channel', { x: 0, y: 0 });
      for (const rendered of [live, parseDocument(captureSnapshot(live), base).html]) {
        const node = all(parse(rendered)).find(n => 'tagName' in n && n.tagName === tag)!;
        assert.equal('childNodes' in node && node.childNodes.map(child => 'value' in child ? child.value : '').join(''), text);
      }
      assert.equal(entry.originalDecoded, 'Original');
    }
  }
});

test('live readonly pre retains the source leading LF without acquiring a marker', () => {
  const source = '<pre>\n\nOriginal</pre><script>draw()</script>';
  const parsed = parseDocument(source, base);
  assert.equal(parsed.entries.length, 0);
  const live = buildLiveDocument(source, base, parsed.entries, {}, 'channel', { x: 0, y: 0 });
  for (const rendered of [live, parseDocument(captureSnapshot(live), base).html]) {
    const node = all(parse(rendered)).find(n => 'tagName' in n && n.tagName === 'pre')!;
    assert.equal('childNodes' in node && 'value' in node.childNodes[0] && node.childNodes[0].value, '\nOriginal');
    assert.equal('attrs' in node && node.attrs.some(attr => attr.name === sourceMarker), false);
  }
});

test('confirmed empty text survives a live preview cycle and gains one mapped Text node', () => {
  const source = '<p>Original</p><script>draw()</script>';
  const { entries } = parseDocument(source, base);
  const entry = entries[0];
  const live = buildLiveDocument(source, base, entries, { [entry.nodeId]: '' }, 'channel', { x: 0, y: 0 });
  const snapshot = parseDocument(captureSnapshot(live), base).html;
  const node = all(parse(snapshot)).find(n => 'tagName' in n && n.tagName === 'p')!;
  assert('attrs' in node && 'childNodes' in node);
  assert.equal(node.childNodes.length, 0);
  assert.equal(node.attrs.find(attr => attr.name === sourceMarker)?.value, entry.nodeId);
  const children: { nodeType: number; data: string }[] = [];
  const element = {
    getAttribute: () => entry.nodeId, namespaceURI: 'http://www.w3.org/1999/xhtml', localName: 'p',
    childNodes: children, get firstChild() { return children[0]; },
    get textContent() { return children.map(child => child.data).join(''); },
    appendChild(child: { nodeType: number; data: string }) { children.push(child); },
  } as unknown as HTMLElement;
  const doc = { querySelectorAll: () => [element], createTextNode: (data: string) => ({ nodeType: 3, data }) } as unknown as Document;
  assert.equal(mapLiveElements(doc, entries, {}).size, 0, 'missing original text stays read-only');
  assert.equal(children.length, 0);
  assert.equal(mapLiveElements(doc, entries, { [entry.nodeId]: '' }).get(element), entry);
  assert.equal(children.length, 1);
  assert.equal(children[0].data, '');
  assert.equal(mapLiveElements(doc, entries, { [entry.nodeId]: '' }).get(element), entry);
  assert.equal(children.length, 1, 'remapping does not duplicate the empty Text node');
});
