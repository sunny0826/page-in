import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLocale,
  localeKey,
  localizeError,
  readLocale,
  setLocale,
  subscribeLocale,
  t,
} from "../src/i18n.ts";

test("missing, invalid and inaccessible language preferences safely default to Chinese", () => {
  assert.equal(readLocale(), "zh");
  assert.equal(readLocale({ getItem: () => "fr" }), "zh");
  assert.equal(
    readLocale({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
    "zh",
  );
  assert.equal(readLocale({ getItem: () => "en" }), "en");
});

test("language changes persist, notify the UI and translate native errors without altering paths", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
  });
  let updates = 0;
  const unsubscribe = subscribeLocale(() => updates++);
  try {
    setLocale("en");
    assert.equal(getLocale(), "en");
    assert.equal(data.get(localeKey), "en");
    assert.equal(readLocale(localStorage), "en");
    assert.equal(t("settings"), "Settings");
    assert.equal(
      t("exported", { path: "/本机/中文.html" }),
      "Exported: /本机/中文.html",
    );
    assert.equal(
      localizeError(new Error("请选择 HTML 文件")),
      "Please choose an HTML file.",
    );
    assert.equal(localizeError("unknown system error"), "unknown system error");
    setLocale("zh");
    assert.equal(t("settings"), "设置");
    assert.equal(updates, 2);
  } finally {
    unsubscribe();
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("unavailable storage does not block changing language for the current session", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("blocked");
    },
  });
  try {
    setLocale("en");
    assert.equal(t("open"), "Open HTML");
  } finally {
    setLocale("zh");
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
