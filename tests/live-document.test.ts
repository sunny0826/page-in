import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { parseDocument } from '../src/parser.ts';
import { buildLiveDocument, mapLiveElements, sourceMarker } from '../src/live-document.ts';

const base = 'pagein-resource://localhost/session/';
type Node = DefaultTreeAdapterTypes.Node;
const all = (node: Node): Node[] => [node, ...('childNodes' in node ? node.childNodes.flatMap(all) : [])];
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
