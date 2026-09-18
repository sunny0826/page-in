import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';
import { parseDocument, utf8Offsets } from '../src/parser.ts';
const base = 'pagein-resource://localhost/session/';
type Node = DefaultTreeAdapterTypes.Node;
const children = (n:Node) => 'childNodes' in n ? n.childNodes : [];
function verifyPaths(source:string) {
  const result=parseDocument(source,base);
  const rendered=parse(result.html);
  for(const entry of result.entries){
    let node:Node=rendered;
    for(const index of entry.domPath) node=children(node)[index];
    assert.equal('tagName' in node && node.tagName,entry.tag);
    const text=children(node)[0];
    assert.equal('value' in text && text.value,entry.originalDecoded);
    assert.equal(Buffer.from(source).subarray(entry.startByte,entry.endByte).toString(),entry.raw);
  }
  return result;
}
test('UTF-16 to UTF-8 offsets cover emoji, CJK and combining characters',()=>{
  const source='a中😀e\u0301'; const offsets=utf8Offsets(source);
  assert.equal(offsets[2],4); assert.equal(offsets[4],8); assert.equal(offsets[source.length],Buffer.byteLength(source));
});
test('BOM, CRLF and entity positions match original bytes',()=>{
  const source='\uFEFF<!doctype html>\r\n<h1>中文 &amp; 😀</h1>\r\n<p>A&#160;B</p>';
  const result=verifyPaths(source); assert.equal(result.entries.length,2); assert.equal(result.entries[0].originalDecoded,'中文 & 😀');
  assert.equal(result.entries[1].originalDecoded,'A\u00a0B');
});
test('runtime scripts and navigation are stripped only from render projection',()=>{
  const source='<meta http-equiv="refresh" content="0; url=https://example.com"><h1 onclick="bad()">Title</h1><script>bad()</script><iframe srcdoc="bad"></iframe><object data="bad"></object>';
  const result=verifyPaths(source); assert(!result.html.includes('bad()')); assert(!result.html.includes('http-equiv="refresh"')); assert(!result.html.includes('<iframe')); assert(result.html.includes("script-src 'none'")); assert(source.includes('bad()'));
});
test('mixed parent remains read only, leaf child remains source mapped',()=>{
  const result=verifyPaths('<p>欢迎 <strong>小明</strong> 加入</p><button>Go</button>');
  assert.deepEqual(result.entries.map(e=>e.tag),['strong','button']);
});
test('implicit tbody and duplicate text have stable distinct mappings',()=>{
  const result=verifyPaths('<table><tr><td>same</td><td>same</td></tr></table>');
  assert.equal(result.entries.length,2); assert.notEqual(result.entries[0].nodeId,result.entries[1].nodeId);
  assert.notDeepEqual(result.entries[0].domPath,result.entries[1].domPath);
});
test('template, noscript, title and style text are not edit candidates',()=>{
  const result=verifyPaths('<head><title>Title</title><style>p{color:red}</style></head><body><template><p>Hidden</p></template><noscript><p>Not source text</p></noscript><p>Visible</p></body>');
  assert.deepEqual(result.entries.map(e=>e.originalDecoded),['Visible']);
});
test('declared unsupported encoding is rejected instead of silently converted',()=>{
  assert.throws(()=>parseDocument('<meta charset="gbk"><h1>abc</h1>',base),/UTF-8/);
});
test('local base and CSS/image references are preserved in render copy',()=>{
  const result=verifyPaths('<base href="assets/"><link rel="stylesheet" href="a.css"><h1>hello</h1><img src="leaf.svg">');
  assert(result.html.includes(base+'assets/')); assert(result.html.includes('href="a.css"')); assert(result.html.includes('src="leaf.svg"'));
});
test('external base is refused and cannot replace resource scope',()=>{
  const result=verifyPaths('<base href="https://example.com/"><h1>hello</h1>');
  assert.equal(result.warnings.length,1); assert(!result.html.includes('https://example.com/'));
});
test('real self-contained and resource fixtures map cleanly',()=>{
  for(const filename of ['self-contained.html','local-resources.html']) {
    const result=verifyPaths(readFileSync(new URL('./fixtures/'+filename,import.meta.url),'utf8'));
    assert(result.entries.length>=4); assert.equal(result.warnings.length,0);
  }
});
test('deck heading lines keep separate source ranges and preserve br markup', () => {
  const source = '<div id="deck"><section class="slide"><h1>第一页 &amp; 标题<br/>第二行😀</h1></section><section class="slide"><h2>下一页</h2></section></div><script>go(1)</script>';
  const result = verifyPaths(source);
  assert.deepEqual(result.entries.map(e => e.originalDecoded), ['第一页 & 标题', '第二行😀', '下一页']);
  assert(result.html.includes('<br>'));
  assert(result.html.includes('id="deck"'));
  const entry = result.entries[1];
  const bytes = Buffer.from(source);
  const edited = Buffer.concat([bytes.subarray(0, entry.startByte), Buffer.from('修改行'), bytes.subarray(entry.endByte)]).toString();
  assert.equal(edited, source.replace('第二行😀', '修改行'));
  assert(edited.includes('<br/>'));
  assert(edited.includes('<script>go(1)</script>'));
});
test('removed scripts between whitespace do not shift later source mappings', () => {
  const source = '<body>\n<script>boot()</script>\n<div id="deck"><section class="slide"><h1>One</h1></section><section class="slide"><h1>Two</h1></section></div><p>before<script>keep()</script>after</p><p>End</p></body>';
  const result = verifyPaths(source);
  assert.deepEqual(result.entries.map(e => e.originalDecoded), ['One', 'Two', 'End']);
});
