import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentationEntries, playPresentationEntries, playAsciiBackground } from '../src/presentation-motion.ts';

function fixture(recipe: string, selectors: Record<string, HTMLElement[]>) {
  return {
    dataset: { animate: recipe },
    querySelectorAll: (selector: string) => selectors[selector] ?? [],
    querySelector: (selector: string) => selectors[selector]?.[0] ?? null,
    ownerDocument: { defaultView: { getComputedStyle: () => ({ opacity: '0.8', transform: 'matrix(1, 0, 0, 1, 3, 0)' }) } },
  } as unknown as HTMLElement;
}

test('bar growth preserves authored widths and staggers bars instead of moving their container', () => {
  const container = {} as HTMLElement;
  const bars = [{}, {}, {}] as HTMLElement[];
  const slide = fixture('bar-grow', {
    '[data-anim]': [container], '[data-anim="up"]': [container], '.row-fill': bars,
  });
  const entries = presentationEntries(slide);
  assert.deepEqual(entries.map(entry => entry.element), bars);
  assert.ok(entries.every(entry => entry.transform === 'scaleX(0)'));
  assert.ok(entries[0].delay < entries[1].delay && entries[1].delay < entries[2].delay);
});

test('unknown recipes and missing known layouts keep marked content in the fallback sequence', () => {
  const elements = [{}, {}] as HTMLElement[];
  for (const recipe of ['unrecognized', 'four-cards']) {
    const entries = presentationEntries(fixture(recipe, { '[data-anim]': elements }));
    assert.deepEqual(entries.map(entry => entry.element), elements);
  }
});

test('authored attributes cannot request unbounded animation targets or delays', () => {
  const slide = fixture('four-cards', { '[data-anim]': Array.from({ length: 1000 }, () => ({} as HTMLElement)) });
  const entries = presentationEntries(slide);
  assert.equal(entries.length, 160);
  assert.ok(entries.every(entry => entry.delay <= 1800));
});

test('entry effects retain computed endpoint styles, do not persist keyframes and cancel on cleanup', () => {
  let cancelled = 0;
  const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  const element = {
    animate(frames: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ frames, options });
      return { cancel() { cancelled++; } };
    },
  } as unknown as HTMLElement;
  const stop = playPresentationEntries(fixture('hero', { '[data-anim]': [element] }), 200);
  assert.equal(calls[0].frames[1].opacity, '0.8');
  assert.equal(calls[0].frames[1].transform, 'matrix(1, 0, 0, 1, 3, 0)');
  assert.equal(calls[0].options.fill, 'backwards');
  assert.equal(calls[0].options.delay, 200);
  stop(); assert.equal(cancelled, 1);
});

test('ASCII uses bounded trusted-shell canvases and removes them and the frame callback on exit', t => {
  const canvases: unknown[] = [];
  const removed: unknown[] = [];
  const cancelled: number[] = [];
  globalThis.requestAnimationFrame = () => 42;
  globalThis.cancelAnimationFrame = id => { cancelled.push(id); };
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  });
  const shell = {
    createElement: () => {
      const canvas = { className: '', setAttribute() {}, getContext: () => ({}), remove() { removed.push(canvas); } };
      return canvas;
    },
    body: { append: (canvas: unknown) => canvases.push(canvas) },
  };
  const slide = {
    ownerDocument: { defaultView: { frameElement: { ownerDocument: shell } } },
    querySelectorAll: () => Array.from({ length: 10 }, () => ({})),
  } as unknown as HTMLElement;
  const stop = playAsciiBackground(slide);
  assert.equal(canvases.length, 2);
  stop();
  assert.deepEqual(removed, canvases);
  assert.deepEqual(cancelled, [42]);
});
