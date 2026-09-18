import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playSlideTransition } from '../src/presentation-motion.ts';

function slide() {
  const animations: Array<{ finish(): void; cancel(): void; options: KeyframeAnimationOptions; cancelled: boolean }> = [];
  const element = {
    hidden: false,
    animate(_frames: Keyframe[], options: KeyframeAnimationOptions) {
      let resolve!: (value: Animation) => void;
      let reject!: (error: Error) => void;
      const finished = new Promise<Animation>((yes, no) => { resolve = yes; reject = no; });
      // Deliberately no finish event: mirrors the native sandbox regression.
      const animation = {
        finished, options, cancelled: false,
        finish() { resolve(animation as unknown as Animation); },
        cancel() { animation.cancelled = true; reject(new Error('cancelled')); },
      };
      animations.push(animation);
      return animation;
    },
  } as unknown as HTMLElement;
  return { element, animations };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('transition hides the old slide when promises finish without any finish events', async () => {
  const previous = slide(), current = slide();
  playSlideTransition(previous.element, current.element, 1);
  assert.equal(previous.animations[0].options.fill, 'both'); // No snap back before cleanup.
  previous.animations[0].finish();
  await flush();
  assert.equal(previous.element.hidden, false);
  current.animations[0].finish();
  await flush();
  assert.equal(previous.element.hidden, true);
  assert.equal(current.element.hidden, false);
  assert.ok([...previous.animations, ...current.animations].every(animation => animation.cancelled));
});

test('late completion from rapid forward/back navigation cannot hide the current slide', async () => {
  const a = slide(), b = slide();
  const stop = playSlideTransition(a.element, b.element, 1);
  a.animations[0].finish(); b.animations[0].finish(); // Promise continuations are queued.
  stop();
  a.element.hidden = false;
  playSlideTransition(b.element, a.element, -1);
  await flush();
  assert.equal(a.element.hidden, false);
  a.animations[1].finish(); b.animations[1].finish();
  await flush();
  assert.equal(a.element.hidden, false);
  assert.equal(b.element.hidden, true);
});

test('exit during animation synchronously hides the previous page and cancels both animations', async () => {
  const previous = slide(), current = slide();
  const stop = playSlideTransition(previous.element, current.element, 1);
  stop(); stop();
  assert.equal(previous.element.hidden, true);
  assert.equal(current.element.hidden, false);
  await flush(); // Rejected finished promises must be consumed.
  assert.ok([...previous.animations, ...current.animations].every(animation => animation.cancelled));
});

test('failed animation creation and unexpected cancellation both leave just the new page', async () => {
  const previous = slide(), current = slide();
  previous.element.animate = () => { throw new Error('unavailable'); };
  playSlideTransition(previous.element, current.element, 1);
  assert.equal(previous.element.hidden, true);
  assert.equal(current.animations[0].cancelled, true);
  await flush();
  const a = slide(), b = slide();
  playSlideTransition(a.element, b.element, 1);
  a.animations[0].cancel();
  await flush();
  assert.equal(a.element.hidden, true);
  assert.equal(b.element.hidden, false);
  assert.equal(b.animations[0].cancelled, true);
});
