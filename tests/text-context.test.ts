import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import type { TextEntry } from '../src/contracts.ts';
import { parseDocument } from '../src/parser.ts';

type Node = DefaultTreeAdapterTypes.Node;
type Fixture = {
  name: string;
  source: string;
  entries: Omit<TextEntry, 'domPath'>[];
  changes?: { text: string; exported: string }[];
  preview?: { tag: string; text: string };
};
const fixtures: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/text-context.json', import.meta.url), 'utf8'));
const children = (node: Node): Node[] => 'childNodes' in node ? node.childNodes : [];
const base = 'pagein-resource://localhost/context-tests/';

function findTag(node: Node, tag: string): Node | undefined {
  if ('tagName' in node && node.tagName === tag) return node;
  for (const child of children(node)) {
    const found = findTag(child, tag);
    if (found) return found;
  }
}

function directText(node: Node): string {
  return children(node).map(child => child.nodeName === '#text' && 'value' in child ? child.value : '').join('');
}

for (const fixture of fixtures) {
  test(`text context mapping: ${fixture.name}`, () => {
    const result = parseDocument(fixture.source, base);
    assert.deepEqual(
      result.entries.map(({ domPath: _path, ...entry }) => entry),
      fixture.entries.map(entry => ({ textContext: 'html', ...entry })),
    );
    const preview = parse(result.html);
    for (const entry of result.entries) {
      let node: Node = preview;
      for (const index of entry.domPath) node = children(node)[index];
      assert.equal('tagName' in node && node.tagName, entry.tag);
      assert.equal(directText(node), entry.originalDecoded);
      assert.equal(Buffer.from(fixture.source).subarray(entry.startByte, entry.endByte).toString(), entry.raw);
    }
    if (fixture.preview) {
      const node = findTag(preview, fixture.preview.tag);
      assert(node);
      assert.equal(directText(node), fixture.preview.text);
    }
  });

  if (fixture.changes) {
    test(`shared Rust export expectations reparse correctly: ${fixture.name}`, () => {
      // document.rs runs Session::export against these exact byte expectations.
      // Reparse them here to verify that those bytes represent the intended text.
      for (const change of fixture.changes!) {
        const node = findTag(parse(change.exported), fixture.entries[0].tag);
        assert(node);
        assert.equal(directText(node), change.text, JSON.stringify(change.text));
      }
    });
  }
}

test('preview compensation preserves later source paths and never alters entries', () => {
  const source = '<pre>\n\nRead only</pre><listing>\r\n\r\nAlso read only</listing><p>Editable 😀</p>';
  const result = parseDocument(source, base);
  assert.deepEqual(result.entries.map(entry => entry.originalDecoded), ['Editable 😀']);
  const entry = result.entries[0];
  let node: Node = parse(result.html);
  for (const index of entry.domPath) node = children(node)[index];
  assert.equal(directText(node), 'Editable 😀');
  assert.equal(Buffer.from(source).subarray(entry.startByte, entry.endByte).toString(), 'Editable 😀');
});
