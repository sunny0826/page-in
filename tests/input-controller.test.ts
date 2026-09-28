import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputController } from '../src/input-controller.ts';
import type { TextEntry } from '../src/contracts.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const camel = (name: string) => name.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
function style(values: Record<string, string> = {}): CSSStyleDeclaration {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) data[camel(key)] = value;
  return Object.assign(data, {
    getPropertyValue(name: string) { return data[camel(name)] ?? ''; },
    setProperty(name: string, value: string) { data[camel(name)] = value; },
    *[Symbol.iterator]() { yield* Object.keys(values); },
  }) as unknown as CSSStyleDeclaration;
}
class FakeText {
  nodeType = 3;
  data: string;
  constructor(value: string) { this.data = value; }
}
class FakeElement extends EventTarget {
  ownerDocument: FakeDocument;
  parentElement: FakeElement | null = null;
  childNodes: FakeText[] = [];
  isConnected = true;
  style = style();
  css: Record<string, string> = {};
  attributes = new Map<string, string>();
  contentEditable = 'false';
  spellcheck = true;
  removed = false;
  rect = { left: 100, top: 100, width: 160, height: 24 };
  constructor(doc: FakeDocument, value = '') { super(); this.ownerDocument = doc; this.textContent = value; }
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent() { return this.childNodes.map(node => node.data).join(''); }
  set textContent(value: string) { this.childNodes = value ? [new FakeText(value)] : []; }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  removeAttribute(key: string) { this.attributes.delete(key); if (key === 'style') this.style = style(); }
  append(element: FakeElement) { this.ownerDocument.appended.push(element); }
  remove() { this.removed = true; }
  focus() { this.ownerDocument.focused = this; }
  contains(node: unknown) { return node === this || this.childNodes.includes(node as FakeText); }
  getBoundingClientRect() { return this.textContent ? this.rect : { ...this.rect, width: 0, height: 0 }; }
}
class FakeDocument {
  appended: FakeElement[] = [];
  focused: FakeElement | null = null;
  target: FakeElement | null = null;
  body = new FakeElement(this);
  defaultView = {
    getComputedStyle: (element: FakeElement) => style({
      transform: 'none', translate: 'none', rotate: 'none', scale: 'none', zoom: '1',
      'writing-mode': 'horizontal-tb', 'font-size': '20px', 'line-height': 'normal',
      display: 'block', visibility: 'visible', '-webkit-user-modify': 'read-only', '--focus': 'red',
      ...element.css, ...(element.style.visibility ? { visibility: element.style.visibility } : {}),
    }),
  };
  selection = { removeAllRanges() {}, addRange() {} };
  createElement() { return new FakeElement(this); }
  createRange() { return { selectNodeContents() {} }; }
  getSelection() { return this.selection; }
  elementFromPoint() { return this.target; }
}
function setup() {
  const host = new FakeDocument(), page = new FakeDocument();
  const element = new FakeElement(page, 'original');
  const entry: TextEntry = { nodeId: '0:8', startByte: 0, endByte: 8, raw: 'original', originalDecoded: 'original', domPath: [], tag: 'p' };
  const entries = new Map([[element as unknown as HTMLElement, entry]]);
  const values = new Map([[entry.nodeId, entry.originalDecoded]]);
  const calls: string[] = [], errors: unknown[] = [];
  const state = {
    enabled: true, sessionId: 'session-1', idle: Promise.resolve(),
    commit: async (_text: string): Promise<void> => {},
  };
  const frame = {
    ownerDocument: host, contentDocument: page,
    getBoundingClientRect: () => ({ left: 0, top: 32 }),
  } as unknown as HTMLIFrameElement;
  const controller = createInputController({
    frame, entries: () => entries, canBegin: () => state.enabled,
    sessionId: () => state.sessionId, idle: () => state.idle,
    value: item => values.get(item.nodeId)!,
    commit: async (sessionId, item, before, text) => {
      assert.equal(sessionId, state.sessionId);
      assert.equal(before, values.get(item.nodeId));
      calls.push(text); await state.commit(text); values.set(item.nodeId, text);
    },
    changed: () => {}, error: error => errors.push(error), label: key => key,
  });
  function type(text: string) {
    const input = controller.active!.input;
    input.textContent = text;
    input.dispatchEvent(new Event('input'));
  }
  return { host, page, element, entry, entries, values, state, controller, calls, errors, type,
    begin: () => controller.begin(element as unknown as HTMLElement) };
}

test('clearing and reopening a fragment retains its mapped node and usable empty input', async () => {
  const context = setup();
  const node = context.element.firstChild;
  await context.begin();
  context.type('');
  assert.equal(context.element.firstChild, node);
  await context.controller.finish();
  assert.equal(context.element.firstChild, node);
  assert.equal(node!.data, '');
  assert.equal(context.controller.hit({ clientX: 105, clientY: 135 }), context.element);
  await context.begin();
  assert.equal(context.controller.active?.input.textContent, '');
  assert.equal(context.controller.active?.input.style.width, '12px');
  assert.equal(context.controller.active?.input.style.height, '24px');
  context.type('restored');
  await context.controller.finish();
  assert.equal(context.element.firstChild, node);
  assert.deepEqual(context.calls, ['', 'restored']);
});

test('a native failure retains and refocuses the draft; retry releases only after acknowledgment', async () => {
  const context = setup();
  await context.begin(); context.type('unconfirmed');
  const input = context.controller.active!.input;
  context.state.commit = async () => { throw new Error('IPC unavailable'); };
  await assert.rejects(context.controller.finish(), /IPC unavailable/);
  assert.equal(context.controller.active?.input, input);
  assert.equal(input.textContent, 'unconfirmed');
  assert.equal(input.contentEditable, 'plaintext-only');
  assert.equal(context.host.focused, input);
  assert.equal(context.values.get(context.entry.nodeId), 'original');
  context.type('corrected');
  let resolve!: () => void;
  context.state.commit = () => new Promise(r => { resolve = r; });
  const pending = context.controller.finish();
  assert.equal(context.controller.finish(), pending);
  assert.equal(input.contentEditable, 'false');
  assert.equal(context.controller.active?.input, input);
  const beforeInput = { inputType: 'insertText', preventDefault() { prevented++; } };
  let prevented = 0;
  context.controller.beforeInput(beforeInput as InputEvent);
  context.controller.paste({ preventDefault() { prevented++; } } as ClipboardEvent);
  assert.equal(prevented, 2);
  await tick(); resolve(); await pending;
  assert.equal(context.controller.active, null);
  assert.equal(context.element.textContent, 'corrected');
  assert.equal(context.element.style.visibility, undefined);
});

test('preflight failure and Esc preserve the core value and mapped node', async () => {
  const context = setup(), node = context.element.firstChild;
  await context.begin(); context.type('bad\0value');
  await assert.rejects(context.controller.finish(), /不支持字符/);
  assert.equal(context.controller.active!.input.textContent, 'bad\0value');
  assert.deepEqual(context.calls, []);
  await context.controller.finish(true);
  assert.equal(context.controller.active, null);
  assert.equal(context.element.firstChild, node);
  assert.equal(node!.data, 'original');
});

test('begin rechecks mode, session, connected target and invalidation after waiting', async () => {
  for (const invalidate of [
    (c: ReturnType<typeof setup>) => { c.state.enabled = false; },
    (c: ReturnType<typeof setup>) => { c.state.sessionId = 'session-2'; },
    (c: ReturnType<typeof setup>) => { c.element.isConnected = false; },
    (c: ReturnType<typeof setup>) => { c.controller.invalidateBegin(); },
  ]) {
    const context = setup();
    let resolve!: () => void;
    context.state.idle = new Promise(r => { resolve = r; });
    const beginning = context.begin(); invalidate(context); resolve(); await beginning;
    assert.equal(context.controller.active, null);
    assert.deepEqual(context.host.appended, []);
  }
});

test('overlapping begins leave only the most recently requested input', async () => {
  const context = setup();
  const second = new FakeElement(context.page, 'second');
  const secondEntry = { ...context.entry, nodeId: '10:16', originalDecoded: 'second' };
  context.entries.set(second as unknown as HTMLElement, secondEntry);
  context.values.set(secondEntry.nodeId, 'second');
  await Promise.all([context.begin(), context.controller.begin(second as unknown as HTMLElement)]);
  assert.equal(context.controller.active?.element, second);
  assert.equal(context.host.appended.length, 1);
});

test('IME finish waits for final input, shares its promise and commits the completed text', async () => {
  const context = setup();
  await context.begin(); context.controller.setComposing(true); context.type('候');
  const first = context.controller.finish();
  assert.equal(context.controller.finish(), first);
  await tick(); assert.deepEqual(context.calls, []);
  context.type('候选完成'); context.controller.setComposing(false);
  await first;
  assert.deepEqual(context.calls, ['候选完成']);
});

test('style copying keeps WebKit editing and shell focus tokens under trusted control', async () => {
  const context = setup();
  await context.begin();
  const input = context.controller.active!.input;
  assert.equal(input.style.getPropertyValue('-webkit-user-modify'), '');
  assert.equal(input.style.getPropertyValue('--focus'), '');
  assert.equal(input.style.outline, '1.5px solid var(--focus)');
  assert.equal(input.contentEditable, 'plaintext-only');
});

test('transformed fragments are rejected before creating any input layer', async () => {
  const context = setup();
  const ancestor = new FakeElement(context.page);
  ancestor.css.scale = '1.5'; context.element.parentElement = ancestor;
  await context.begin();
  assert.equal(context.controller.active, null);
  assert.deepEqual(context.errors, ['transform']);
  assert.equal(context.host.appended.length, 0);
});

test('empty fragments in hidden slide ancestors do not acquire a ghost hit region', async () => {
  const context = setup();
  await context.begin(); context.type(''); await context.controller.finish();
  const ancestor = new FakeElement(context.page);
  ancestor.css.display = 'none'; context.element.parentElement = ancestor;
  assert.equal(context.controller.hit({ clientX: 105, clientY: 135 }), null);
});

test('an adjacent inline fragment cannot swallow the cleared fragment minimum hit box', async () => {
  const context = setup();
  await context.begin(); context.type(''); await context.controller.finish();
  const adjacent = new FakeElement(context.page, 'adjacent');
  context.entries.set(adjacent as unknown as HTMLElement, { ...context.entry, nodeId: '10:18' });
  context.page.target = adjacent;
  assert.equal(context.controller.hit({ clientX: 105, clientY: 135 }), context.element);
  assert.equal(context.controller.hit({ clientX: 115, clientY: 135 }), adjacent);
});

test('begin cannot replace a draft while its commit is pending or after it fails', async () => {
  const context = setup();
  await context.begin(); context.type('retain me');
  const originalInput = context.controller.active!.input;
  const second = new FakeElement(context.page, 'second');
  const entry = { ...context.entry, nodeId: '10:16', originalDecoded: 'second' };
  context.entries.set(second as unknown as HTMLElement, entry);
  context.values.set(entry.nodeId, 'second');
  let reject!: (error: Error) => void;
  context.state.commit = () => new Promise((_, r) => { reject = r; });
  const beginning = context.controller.begin(second as unknown as HTMLElement);
  const failure = assert.rejects(beginning, /native rejection/);
  await tick();
  assert.equal(context.controller.active!.input, originalInput);
  reject(new Error('native rejection')); await failure;
  assert.equal(context.controller.active!.input, originalInput);
  assert.equal(originalInput.textContent, 'retain me');
  assert.equal(context.host.appended.length, 1);
});
