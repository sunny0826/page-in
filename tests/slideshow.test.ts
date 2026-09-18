import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlideshow } from '../src/slideshow.ts';

function fixture(initial = false) {
  let fullscreen = initial;
  const requests: boolean[] = [];
  const states: boolean[] = [];
  const checks = new Set<() => void>();
  const host = {
    isFullscreen: async () => fullscreen,
    setFullscreen: async (value: boolean) => { requests.push(value); fullscreen = value; },
  };
  const show = createSlideshow(host, value => states.push(value), check => {
    checks.add(check);
    return () => { checks.delete(check); };
  });
  const tick = async () => {
    for (const check of [...checks]) { checks.delete(check); check(); }
    await new Promise(resolve => setImmediate(resolve));
  };
  return { host, requests, states, show, tick, checks };
}

test('enter and exit restore a windowed session, and rapid requests are serialized', async () => {
  const { show, requests, states } = fixture();
  await Promise.all([show.enter(), show.enter(), show.exit(), show.exit()]);
  assert.deepEqual(requests, [true, false]);
  assert.deepEqual(states, [true, false]);
});

test('a session that was fullscreen remains fullscreen after leaving the show', async () => {
  const { show, requests, states } = fixture(true);
  await show.enter(); await show.exit();
  assert.deepEqual(requests, []);
  assert.deepEqual(states, [true, false]);
});

test('native entry failure does not hide the shell and can be retried', async () => {
  const { show, host, states } = fixture();
  const set = host.setFullscreen;
  host.setFullscreen = async () => { throw new Error('denied'); };
  await assert.rejects(show.enter(), /denied/);
  assert.deepEqual(states, []);
  host.setFullscreen = set;
  await show.enter();
  assert.deepEqual(states, [true]);
});

test('native exit failure restores the shell instead of retaining hidden controls', async () => {
  const { show, host, states } = fixture();
  await show.enter();
  const set = host.setFullscreen;
  host.setFullscreen = async () => { throw new Error('failed'); };
  await assert.rejects(show.exit(), /failed/);
  assert.deepEqual(states, [true, false]);
  host.setFullscreen = set;
  await show.exit();
  assert.deepEqual(states, [true, false]);
});

test('the toolbar returns before a slow native exit has finished', async () => {
  const { show, host, states } = fixture();
  await show.enter();
  let complete!: () => void;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  host.setFullscreen = async () => pending;
  const exit = show.exit();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states, [true, false]);
  complete();
  await exit;
});

test('a delayed system exit after the last resize is detected without another event', async () => {
  const { show, host, states, tick, checks } = fixture();
  await show.enter();
  await show.sync(); // Last resize occurs while the native transition still reports fullscreen.
  await tick();
  assert.deepEqual(states, [true]);
  await host.setFullscreen(false); // Animation completes, but no new resize is emitted.
  await tick();
  assert.deepEqual(states, [true, false]);
  assert.equal(checks.size, 0);
});

test('monitoring recovers from a transient query failure and stops after explicit exit', async () => {
  const { show, host, states, tick, checks } = fixture();
  await show.enter();
  const read = host.isFullscreen;
  host.isFullscreen = async () => { throw new Error('temporarily unavailable'); };
  await tick();
  assert.equal(checks.size, 1);
  host.isFullscreen = read;
  await host.setFullscreen(false);
  await tick();
  assert.deepEqual(states, [true, false]);
  await show.enter(); await show.exit();
  assert.equal(checks.size, 0);
});

test('leaving fullscreen through the system restores the shell once', async () => {
  const { show, host, states } = fixture();
  await show.enter();
  await host.setFullscreen(false);
  await show.sync(); await show.sync(); await show.exit();
  assert.deepEqual(states, [true, false]);
});
