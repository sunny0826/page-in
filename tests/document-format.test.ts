import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../src/parser.ts';

const base = 'pagein-resource://localhost/session/';
const format = (source: string) => parseDocument(source, base).format;

test('continuous reports and ordinary HTML use the report label', () => {
  for (const source of [
    '<article><h1>年度报告</h1><section><p>摘要</p></section><section><p>结论</p></section></article>',
    '<h1>PPT 制作教程</h1><p>Reveal.js and slides</p>',
    '<div id="deck"><p>Deck furniture report</p></div>',
    '<div class="slides"><img src="one.png"><img src="two.png"></div>',
    '<section class="slide-example"><p>One</p></section><section class="slide-example"><p>Two</p></section>',
  ]) assert.equal(format(source), 'report');
});

test('recognizes explicit decks, single slides, nested Reveal decks and sibling slides', () => {
  for (const source of [
    '<div id="deck"><section><h1>One</h1></section><section><p>Two</p></section></div>',
    '<div class="slides"><div class="slide active"><h1>One</h1></div></div>',
    '<div class="reveal"><div class="slides"><section><section><h1>Vertical</h1></section></section></div></div>',
    '<main class="slide-deck"><section><h1>One</h1></section></main>',
    '<main><section class="slide"><h1>One</h1></section><section class="slide"><p>Two</p></section></main>',
  ]) assert.equal(format(source), 'presentation');
});

test('inactive templates and script text cannot label a report as a presentation', () => {
  assert.equal(format('<template><div id="deck"><section>Hidden</section></div></template><script>"<div class=slides><section>Fake</section></div>"</script><p>Report</p>'), 'report');
});

test('classification preserves preview content and original UTF-8 patch ranges', () => {
  const source = '\uFEFF<div id="deck">\r\n<section><h1>标题 &amp; 😀</h1></section></div><script>go()</script>';
  const result = parseDocument(source, base);
  assert.equal(result.format, 'presentation');
  assert.equal(result.entries.length, 1);
  const entry = result.entries[0];
  assert.equal(Buffer.from(source).subarray(entry.startByte, entry.endByte).toString(), '标题 &amp; 😀');
  assert(!result.html.includes('data-pagein'));
  assert(!result.html.includes('go()'));
});
