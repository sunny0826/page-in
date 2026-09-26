import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputTransaction, MAX_INPUT_BYTES, validateInputText } from '../src/input-transaction.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(commit: (text: string) => Promise<void> = async () => {}) {
  const completed: string[] = [];
  let recoveries = 0, pending = 0;
  const transaction = createInputTransaction({
    before: 'original', commit, idle: () => Promise.resolve(),
    complete: text => completed.push(text),
    recover: () => { recoveries++; },
    pending: () => { pending++; },
  });
  return { transaction, completed, get recoveries() { return recoveries; }, get pending() { return pending; } };
}

test('a failed native commit retains the draft, blocks continuations and can be retried', async () => {
  let calls = 0, continued = false;
  const context = setup(async text => {
    assert.equal(text, '中文 😀');
    if (++calls === 1) throw new Error('StaleRevision');
  });
  context.transaction.setDraft('中文 😀');
  await assert.rejects(context.transaction.finish().then(() => { continued = true; }), /StaleRevision/);
  assert.equal(continued, false);
  assert.equal(context.transaction.draft, '中文 😀');
  assert.equal(context.transaction.phase, 'editing');
  assert.equal(context.recoveries, 1);
  assert.deepEqual(context.completed, []);
  await context.transaction.finish();
  assert.deepEqual(context.completed, ['中文 😀']);
  assert.equal(calls, 2);
});

test('Esc after failure restores the confirmed value without another IPC request', async () => {
  let calls = 0;
  const context = setup(async () => { calls++; throw new Error('IPC unavailable'); });
  context.transaction.setDraft('unconfirmed');
  await assert.rejects(context.transaction.finish(), /IPC unavailable/);
  await context.transaction.finish(true);
  assert.deepEqual(context.completed, ['original']);
  assert.equal(calls, 1);
  assert.equal(context.transaction.phase, 'finished');
});

test('all finishes share one pending commit and edits remain frozen until acknowledgment', async () => {
  let resolve!: () => void;
  const values: string[] = [];
  const context = setup(text => {
    values.push(text);
    return new Promise(r => { resolve = r; });
  });
  context.transaction.setDraft('snapshot');
  const first = context.transaction.finish();
  assert.equal(context.transaction.finish(), first);
  assert.equal(context.transaction.finish(true), first);
  assert.equal(context.transaction.setDraft('lost input'), false);
  assert.equal(context.transaction.draft, 'snapshot');
  assert.deepEqual(context.completed, []);
  assert.equal(context.pending, 1);
  await tick();
  assert.deepEqual(values, ['snapshot']);
  resolve(); await first;
  assert.deepEqual(context.completed, ['snapshot']);
});

test('UTF-8 byte limit accepts the boundary and counts multibyte Unicode', () => {
  assert.doesNotThrow(() => validateInputText('x'.repeat(MAX_INPUT_BYTES)));
  assert.doesNotThrow(() => validateInputText('😀'.repeat(MAX_INPUT_BYTES / 4)));
  assert.throws(() => validateInputText('😀'.repeat(MAX_INPUT_BYTES / 4) + 'a'), /文字过长/);
  assert.throws(() => validateInputText('中'.repeat(Math.floor(MAX_INPUT_BYTES / 3) + 1)), /文字过长/);
  assert.throws(() => validateInputText('before\0after'), /不支持字符/);
});

test('preflight failure retains editable input without calling native IPC', async () => {
  let calls = 0;
  const context = setup(async () => { calls++; });
  context.transaction.setDraft('bad\0value');
  await assert.rejects(context.transaction.finish(), /不支持字符/);
  assert.equal(context.transaction.draft, 'bad\0value');
  assert.equal(context.transaction.phase, 'editing');
  assert.equal(context.recoveries, 1);
  assert.equal(calls, 0);
  context.transaction.setDraft('corrected');
  await context.transaction.finish();
  assert.deepEqual(context.completed, ['corrected']);
});

test('empty input is a valid edit; unchanged and canceled input never commit', async () => {
  const values: string[] = [];
  const context = setup(async text => { values.push(text); });
  context.transaction.setDraft('');
  await context.transaction.finish();
  assert.deepEqual(values, ['']);
  assert.deepEqual(context.completed, ['']);
  const unchanged = setup(async () => assert.fail('unchanged input committed'));
  await unchanged.transaction.finish();
  assert.deepEqual(unchanged.completed, ['original']);
});
