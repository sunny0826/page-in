import { test } from "node:test";
import assert from "node:assert/strict";
import {
  closeDialog,
  dismissDialog,
  getUI,
  showDialog,
  subscribeUI,
  updateUI,
} from "../src/ui-state.ts";

test("dismissing the unsaved dialog resolves its pending decision only once", () => {
  let cancellations = 0;
  showDialog("未导出", "保留修改", [], () => cancellations++);
  dismissDialog();
  dismissDialog();
  assert.equal(cancellations, 1);
  assert.equal(getUI().dialog, null);
});

test("replacing a dialog cancels its old guard; action close does not cancel the new guard", () => {
  const cancelled: string[] = [];
  showDialog("旧操作", "", [], () => cancelled.push("old"));
  showDialog("新操作", "", [], () => cancelled.push("new"));
  assert.deepEqual(cancelled, ["old"]);
  assert.equal(getUI().dialog?.title, "新操作");
  closeDialog();
  assert.deepEqual(cancelled, ["old"]);
});

test("unsaved-change confirmation closes settings and retains the document", () => {
  updateUI({ settingsOpen: true, filename: "working.html", dirty: true });
  showDialog("保留修改", "", []);
  assert.equal(getUI().settingsOpen, false);
  assert.equal(getUI().filename, "working.html");
  assert.equal(getUI().dirty, true);
  dismissDialog();
});

test("render snapshots preserve document state while settings and notices change", () => {
  updateUI({ filename: "example.html", dirty: true });
  const before = getUI();
  let updates = 0;
  const unsubscribe = subscribeUI(() => updates++);
  updateUI({ settingsOpen: true, notice: "提示" });
  assert.equal(getUI().filename, "example.html");
  assert.equal(getUI().dirty, true);
  assert.notEqual(getUI(), before);
  assert.equal(before.settingsOpen, false);
  assert.equal(updates, 1);
  unsubscribe();
  updateUI({ settingsOpen: false, notice: null });
  assert.equal(updates, 1);
});
