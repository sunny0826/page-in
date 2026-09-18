import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenRequestPump } from "../src/open-request-pump.ts";

const tick = () => new Promise((resolve) => setImmediate(resolve));
test("IPC failure does not retry in a loop when the error updates UI", async () => {
  let calls = 0;
  const pump = createOpenRequestPump({
    blocked: () => false,
    pending: async () => {
      calls++;
      throw new Error("IPC unavailable");
    },
    open: async () => assert.fail("must not open"),
    dismiss: async () => assert.fail("must not dismiss"),
    error: () => pump.wake(),
  });
  pump.wake();
  await tick();
  assert.equal(calls, 1);
});
test("startup drains requests serially, including failures and canceled opens", async () => {
  const queue = ["cancel", "fail", "success"];
  const opened: string[] = [],
    dismissed: string[] = [],
    errors: unknown[] = [];
  let active = 0;
  const pump = createOpenRequestPump({
    blocked: () => false,
    pending: async () => queue[0] ?? null,
    open: async (id) => {
      assert.equal(++active, 1);
      opened.push(id);
      await tick();
      active--;
      if (id === "fail") throw new Error("invalid HTML");
    },
    dismiss: async (id) => {
      dismissed.push(id);
      queue.shift();
    },
    error: (error) => errors.push(error),
  });
  pump.wake();
  pump.wake();
  pump.wake();
  for (let n = 0; n < 6; n++) await tick();
  assert.deepEqual(opened, ["cancel", "fail", "success"]);
  assert.deepEqual(dismissed, opened);
  assert.equal(errors.length, 1);
});

test("modal, busy and composition blockers defer requests without consuming them", async () => {
  let blocked = true;
  const queue = ["first", "second"];
  const opened: string[] = [];
  const pump = createOpenRequestPump({
    blocked: () => blocked,
    pending: async () => queue[0] ?? null,
    open: async (id) => {
      opened.push(id);
      blocked = true;
    },
    dismiss: async () => {
      queue.shift();
    },
    error: (error) => assert.fail(String(error)),
  });
  pump.wake();
  await tick();
  assert.deepEqual(opened, []);
  blocked = false;
  pump.wake();
  await tick();
  assert.deepEqual(opened, ["first"]);
  assert.deepEqual(queue, ["second"]);
  blocked = false;
  pump.wake();
  await tick();
  assert.deepEqual(opened, ["first", "second"]);
});

test("a notification during an empty pending read is not lost", async () => {
  let resolve!: (value: string | null) => void;
  let first = true;
  const queue: string[] = [],
    opened: string[] = [];
  const pump = createOpenRequestPump({
    blocked: () => false,
    pending: () => {
      if (first) {
        first = false;
        return new Promise((r) => {
          resolve = r;
        });
      }
      return Promise.resolve(queue[0] ?? null);
    },
    open: async (id) => {
      opened.push(id);
    },
    dismiss: async () => {
      queue.shift();
    },
    error: (error) => assert.fail(String(error)),
  });
  pump.wake();
  queue.push("late");
  pump.wake();
  resolve(null);
  await tick();
  assert.deepEqual(opened, ["late"]);
});
