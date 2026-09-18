import './style.css';
import { createOpenRequestPump } from './open-request-pump.ts';
import './scrollbars.css';
import { stylePageScrollbars } from './page-scrollbars.ts';
import { preparePresentation } from './presentation.ts';
import { createSlideshow } from './slideshow.ts';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { OpenedDocument, ParsedDocument, SessionView, TextEntry } from './contracts.ts';
import { getLocale, subscribeLocale, t, localizeError } from './i18n.ts';
import { mountShell } from './shell.tsx';
import { closeDialog, getUI, showDialog, updateUI, subscribeUI } from './ui-state.ts';

document.documentElement.classList.toggle('macos', /Mac/.test(navigator.platform));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const frame = $<HTMLIFrameElement>('page');
const surface = $('input-surface');
function syncLocale() {
  document.documentElement.lang = getLocale() === 'zh' ? 'zh-CN' : 'en';
  frame.title = t('htmlPage');
}
syncLocale();
subscribeLocale(syncLocale);
let opened: OpenedDocument | null = null;
let parsed: ParsedDocument | null = null;
let view: SessionView = { revision: 0, texts: {}, canUndo: false, canRedo: false, dirty: false };
let elements = new Map<HTMLElement, TextEntry>();
let editing = false;
let active: { element: HTMLElement; input: HTMLDivElement; entry: TextEntry; before: string; attributes: Record<string,string|null> } | null = null;
let pipeline = Promise.resolve();
let pending = 0;
let switchingDocument = false;
let composing = false;
let noticeTimer = 0;
let parseMs = 0;
let startupMs = 0;
let mapFailures = 0;
let presentation: ReturnType<typeof preparePresentation> = null;
let lastSlideWheel = 0;
let restoreEditing = false;
let controlsTimer = 0;
let fullscreenCheckTimer = 0;
const slideshow = createSlideshow({
  isFullscreen: () => getCurrentWindow().isFullscreen(),
  setFullscreen: async value => {
    const host = getCurrentWindow();
    await host.setFullscreen(value);
    // macOS changes Spaces asynchronously; don't hide the shell on request alone.
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await host.isFullscreen() === value) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Roll back a failed entry only; never re-enter fullscreen after an exit timeout.
    if (value) await host.setFullscreen(false);
    throw new Error(t('fullscreenTimeout'));
  },
}, value => {
  if (value) restoreEditing = editing;
  document.documentElement.classList.toggle('slideshow', value);
  updateUI({ presenting: value, presentationControls: true });
  setMode(value ? false : restoreEditing);
  clearTimeout(controlsTimer);
  if (value) revealPresentationControls();
  requestAnimationFrame(() => {
    if (value) {
      if (presentation) surface.focus({ preventScroll: true });
      else frame.contentWindow?.focus();
    } else {
      document.querySelector<HTMLButtonElement>(`.titlebar button[aria-label="${t('present')}"]`)?.focus();
    }
  });
});

function revealPresentationControls() {
  if (!getUI().presenting) return;
  clearTimeout(controlsTimer);
  if (!getUI().presentationControls) updateUI({ presentationControls: true });
  controlsTimer = window.setTimeout(() => updateUI({ presentationControls: false }), 2200);
}
async function startSlideshow() {
  if (!opened || getUI().busy || getUI().presenting || getUI().dialog || getUI().settingsOpen) return;
  await finish();
  await enqueue(() => slideshow.enter());
}
function exitSlideshow() { return enqueue(() => slideshow.exit()); }

async function goSlide(index: number) {
  await finish();
  if (!presentation) return;
  updateUI({ slideIndex: presentation.go(index) });
}
function slideWheel(event: WheelEvent) {
  if (!presentation || active || getUI().dialog || getUI().settingsOpen || event.ctrlKey) return;
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (Math.abs(delta) < 8 || performance.now() - lastSlideWheel < 450) return;
  lastSlideWheel = performance.now();
  void goSlide(presentation.index + Math.sign(delta)).catch(notice);
}

function notice(message: unknown) {
  clearTimeout(noticeTimer);
  updateUI({ notice: localizeError(message) });
  noticeTimer = window.setTimeout(() => updateUI({ notice: null }), 6000);
}
function update() {
  updateUI({ busy: pending > 0 || switchingDocument, dirty: view.dirty, canUndo: view.canUndo, canRedo: view.canRedo, activeInput: !!active });
  document.body.classList.toggle('busy', pending > 0 || switchingDocument);
}
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  pending++; update();
  const operation = pipeline.then(fn);
  pipeline = operation.then(() => {}, error => { notice(error); }).finally(() => { pending--; update(); });
  return operation;
}
function sync(next: SessionView) {
  view = next;
  for (const [element, entry] of elements) {
    const text = next.texts[entry.nodeId] ?? entry.originalDecoded;
    if (element !== active?.element && element.textContent !== text) element.textContent = text;
  }
  update();
}
function restoreAttributes(element: HTMLElement, attributes: Record<string,string|null>) {
  for (const [key, value] of Object.entries(attributes)) {
    if(value === null) element.removeAttribute(key); else element.setAttribute(key, value);
  }
}
// Only leaf elements with one mapped Text node can enter this transaction.
function finish(cancel = false): Promise<void> {
  if (!active) return pipeline;
  const transaction = active;
  active = null;
  const text = cancel ? transaction.before : transaction.input.textContent ?? '';
  transaction.input.remove();
  restoreAttributes(transaction.element, transaction.attributes);
  transaction.element.textContent = text;
  if (text === transaction.before) { update(); return pipeline; }
  return enqueue(async () => {
    try {
      sync(await invoke<SessionView>('commit_edit', { sessionId: opened!.sessionId, expectedRevision: view.revision, nodeId: transaction.entry.nodeId, oldText: transaction.before, newText: text }));
    } catch (error) {
      transaction.element.textContent = transaction.before;
      throw error;
    }
  });
}
async function begin(element: HTMLElement) {
  if (!editing || switchingDocument || active?.element === element) return;
  await finish();
  const entry = elements.get(element);
  if (!entry || !opened) return;
  const expected = view.texts[entry.nodeId] ?? entry.originalDecoded;
  if (element.textContent !== expected || element.childNodes.length !== 1 || element.firstChild?.nodeType !== Node.TEXT_NODE) { notice(t('changed')); return; }
  const computed = element.ownerDocument.defaultView!.getComputedStyle(element);
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = element.ownerDocument.defaultView!.getComputedStyle(ancestor);
    if (style.transform !== 'none' || style.writingMode !== 'horizontal-tb' || !['1', 'normal'].includes(style.zoom)) {
      notice(t('transform')); return;
    }
  }
  const input = document.createElement('div');
  for (const property of Array.from(computed)) {
    // WebKit exposes -webkit-user-modify: read-only in computed styles.
    // Copying it inline overrides contenteditable's UA style and blocks typing,
    // even though focus/selection and our custom paste handler still work.
    if (property === '-webkit-user-modify') continue;
    input.style.setProperty(property, computed.getPropertyValue(property));
  }
  Object.assign(input.style, { position: 'fixed', margin: '0', boxSizing: 'border-box', minWidth: '0', maxWidth: 'none', minHeight: '0', maxHeight: 'none', transform: 'none', animation: 'none', transition: 'none', display: 'block', visibility: 'visible', overflow: 'hidden', outline: '1.5px solid #8ea574', outlineOffset: '5px', zIndex: '12', userSelect: 'text' });
  input.contentEditable = 'plaintext-only';
  input.spellcheck = false;
  input.setAttribute('role', 'textbox');
  input.setAttribute('aria-label', t('edit'));
  input.textContent = expected;
  active = { element, input, entry, before: expected, attributes: {style: element.getAttribute('style')} };
  element.style.visibility = 'hidden';
  document.body.append(input);
  positionInput();
  input.addEventListener('input', () => { if (active?.input === input) { element.textContent = input.textContent; positionInput(); } });
  input.addEventListener('blur', () => { if (active?.input === input) void finish().catch(notice); });
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  const selection = document.getSelection();
  selection?.removeAllRanges(); selection?.addRange(range);
  update();
}
function setMode(value: boolean) {
  presentation?.setMotionEnabled(getUI().presenting && !value);
  editing = value;
  surface.hidden = !value && !presentation;
  surface.tabIndex = presentation ? 0 : -1;
  if (presentation) surface.focus({ preventScroll: true });
  updateUI({ editing: value, menuOpen: false, notice: null });
  clearTimeout(noticeTimer);
}
async function parseInWorker(source: string, resourceBase: string): Promise<ParsedDocument> {
  const start = performance.now();
  const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error(t('parseTimeout'))); }, 15000);
    worker.onmessage = event => { clearTimeout(timeout); worker.terminate(); parseMs = performance.now() - start; event.data.ok ? resolve(event.data.result) : reject(new Error(event.data.error)); };
    worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ source, resourceBase });
  });
}
function mapElements(document: Document, result: ParsedDocument) {
  elements.clear(); mapFailures = 0;
  for (const entry of result.entries) {
    let node: Node | undefined = document;
    for (const index of entry.domPath) node = node?.childNodes[index];
    if (node?.nodeType === Node.ELEMENT_NODE && (node as Element).localName === entry.tag && node.textContent === entry.originalDecoded && node.childNodes.length === 1 && node.firstChild?.nodeType === Node.TEXT_NODE) {
      elements.set(node as HTMLElement, entry);
    } else mapFailures++;
  }
}
function positionInput() {
  if (!active) return;
  const rect = active.element.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  Object.assign(active.input.style, {left: rect.left + frameRect.left + "px", top: rect.top + frameRect.top + "px", width: rect.width + "px", height: rect.height + "px"});
}
function hit(event: MouseEvent): HTMLElement | null {
  const rect = frame.getBoundingClientRect();
  return frame.contentDocument?.elementFromPoint(event.clientX - rect.left, event.clientY - rect.top) as HTMLElement | null;
}
surface.addEventListener("dblclick", event => {
  event.preventDefault();
  const target = hit(event);
  if (target && elements.has(target)) void begin(target).catch(notice);
  else notice(t('plainOnly'));
});
surface.addEventListener("pointerdown", () => { updateUI({ menuOpen: false }); void finish().catch(notice); });
surface.addEventListener("wheel", event => {
  if (presentation) { slideWheel(event); return; }
  event.preventDefault();
  const target = hit(event);
  void finish().then(() => {
    const doc = frame.contentDocument;
    if (!doc) return;
    let scroller: Element | null = target;
    while (scroller && scroller !== doc.documentElement) {
      const css = doc.defaultView!.getComputedStyle(scroller);
      if (/(auto|scroll)/.test(css.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? frame.clientHeight : 1;
    (scroller ?? doc.scrollingElement)?.scrollBy({left: event.deltaX * unit, top: event.deltaY * unit});
  }).catch(notice);
}, {passive: false});
window.addEventListener("resize", positionInput);
document.addEventListener("beforeinput", event => {
  if (active && (event.inputType.startsWith("format") || ["insertParagraph", "insertLineBreak"].includes(event.inputType))) event.preventDefault();
});
document.addEventListener("paste", event => {
  if (!active) return;
  event.preventDefault();
  const selection = document.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!active.input.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(event.clipboardData?.getData("text/plain") ?? "");
  range.insertNode(node); range.setStartAfter(node); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
  active.element.textContent = active.input.textContent;
  positionInput();
});
// Native drop owns file access; never let the browser navigate to a dropped file.
function preventFileDrop(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
}
document.addEventListener('dragover', preventFileDrop);
document.addEventListener('drop', event => {
  if (editing) event.preventDefault();
  preventFileDrop(event);
});
async function open(sample = false, project = false, requestId?: string) {
  if (switchingDocument) return;
  switchingDocument = true; update();
  try {
    if (getUI().presenting) await exitSlideshow();
    await finish();
    if (!await guardUnsaved()) return;
    await enqueue(async () => {
      const next = await invoke<OpenedDocument | null>(requestId ? 'open_requested_document' : sample ? 'open_sample' : project ? 'open_project' : 'open_document', { locale: getLocale(), requestId });
      if (!next) return;
      let activated = false;
      try {
        const result = await parseInWorker(next.source, next.resourceBase);
        const registered = await invoke<SessionView>('register_manifest', { sessionId: next.sessionId, entries: result.entries });
        activated = true;
        presentation?.dispose();
        opened = next; parsed = result;
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(t('renderTimeout'))), 10000);
          frame.onload = () => {
            try {
              const doc = frame.contentDocument;
              if (!doc) throw new Error(t('frameUnavailable'));
              mapElements(doc, result); sync(registered);
              clearTimeout(timer); resolve();
            } catch (error) { clearTimeout(timer); reject(error); }
          };
          frame.srcdoc = result.html;
        });
        frame.hidden = false;
        // Hidden iframe documents can return empty computed styles in WebKit.
        stylePageScrollbars(frame.contentDocument!);
        presentation = preparePresentation(frame.contentDocument!);
        frame.contentDocument!.addEventListener('dragover', preventFileDrop);
        frame.contentDocument!.addEventListener('drop', preventFileDrop);
        frame.contentDocument!.addEventListener('keydown', keyboard);
        frame.contentDocument!.addEventListener('wheel', slideWheel, { passive: false });
        frame.contentDocument!.addEventListener('pointermove', revealPresentationControls);
        updateUI({ filename: next.filename, documentFormat: result.format, project: next.project, slideIndex: 0, slideCount: presentation?.slides.length ?? 0 }); setMode(false);
        if (result.warnings.length || mapFailures) showDialog(t('support'), [...result.warnings.map(localizeError), ...(mapFailures ? [t('mapping', { count: mapFailures })] : [])].join('\n'), [{ label: t('preview'), icon: 'eye', action: closeDialog }]);
      } catch (error) {
        if (!activated) throw error; // Reading or parsing failure keeps the active document intact.
        // The native session changed; never keep an old page attached to its resource token.
        active?.input.remove(); surface.hidden = true; opened = null; parsed = null; elements.clear(); active = null; frame.srcdoc = ''; frame.hidden = true;
        presentation?.dispose(); presentation = null;
        editing = false; updateUI({ filename: null, documentFormat: null, project: false, slideCount: 0, slideIndex: 0, editing: false });
        view = { revision: 0, texts: {}, canUndo: false, canRedo: false, dirty: false };
        throw error;
      }
    });
  } finally { switchingDocument = false; update(); }
}
async function exportFile(): Promise<boolean> {
  await finish();
  return enqueue(async () => {
    const path = await invoke<string | null>('export_document', { sessionId: opened!.sessionId, expectedRevision: view.revision, locale: getLocale() });
    if (!path) return false;
    view.dirty = false; update(); notice(t('exported', { path }));
    return true;
  });
}
async function guardUnsaved(): Promise<boolean> {
  if (!view.dirty) return true;
  return new Promise(resolve => {
    showDialog(t('unsaved'), t('unsavedBody'), [
      { label: t('cancel'), icon: 'close', action: () => { closeDialog(); resolve(false); } },
      { label: t('discard'), icon: 'trash', danger: true, action: () => { closeDialog(); resolve(true); } },
      { label: t('exportContinue'), icon: 'export', primary: true, action: () => { closeDialog(); void exportFile().then(resolve).catch(error => { notice(error); resolve(false); }); } },
    ], () => resolve(false));
  });
}
async function history(command: string) { await finish(); await enqueue(async () => sync(await invoke<SessionView>(command, { sessionId: opened!.sessionId, expectedRevision: view.revision }))); }
function keyboard(event: KeyboardEvent) {
  if (switchingDocument || event.isComposing || getUI().dialog || getUI().settingsOpen || getUI().menuOpen) return;
  if (getUI().presenting && event.key === 'Escape') {
    event.preventDefault(); void exitSlideshow().catch(notice); return;
  }
  if (event.key === 'F5' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault(); void startSlideshow().catch(notice); return;
  }
  const inControl = event.target instanceof Element && !!event.target.closest('button, input, select, textarea, [contenteditable]');
  if (presentation && !active && !inControl && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? presentation.slides.length - 1
      : ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key) ? presentation.index + 1
      : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key) ? presentation.index - 1 : null;
    if (index !== null) { event.preventDefault(); void goSlide(index).catch(notice); return; }
  }
  if (active && event.key === 'Escape') { event.preventDefault(); void finish(true).catch(notice); }
  if (active && event.key === 'Enter') { event.preventDefault(); void finish().catch(notice); }
  // A show is read-only; editing shortcuts must not alter history behind it.
  if (getUI().presenting) return;
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && opened) { event.preventDefault(); void exportFile().catch(notice); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !active && opened) { event.preventDefault(); void history(event.shiftKey ? 'redo_edit' : 'undo_edit').catch(notice); }
}
function settings() {
  void finish().then(() => updateUI({ settingsOpen: true, diagnostics: {
    filename: opened?.filename ?? null,
    editable: elements.size,
    total: parsed?.entries.length ?? 0,
    parseMs,
    startupMs,
    engine: navigator.userAgent,
  }})).catch(notice);
}
mountShell({
  open: () => { if (switchingDocument) return; showDialog(t('openChoice'), t('openChoiceBody'), [
    { label: t('open'), icon: 'file', action: () => { closeDialog(); void open().catch(notice); } },
    { label: t('openProject'), icon: 'project', primary: true, action: () => { closeDialog(); void open(false, true).catch(notice); } },
  ]); },
  previousSlide: () => { if (presentation) void goSlide(presentation.index - 1).catch(notice); },
  nextSlide: () => { if (presentation) void goSlide(presentation.index + 1).catch(notice); },
  sample: () => { void open(true).catch(notice); },
  edit: () => setMode(true),
  preview: () => { void finish().then(() => setMode(false)).catch(notice); },
  present: () => { void startSlideshow().catch(notice); },
  exitPresentation: () => { void exitSlideshow().catch(notice); },
  exportFile: () => { void exportFile().catch(notice); },
  undo: () => { void history('undo_edit').catch(notice); },
  redo: () => { void history('redo_edit').catch(notice); },
  finishInput: () => { void finish().catch(notice); },
  settings,
});
document.addEventListener('keydown', keyboard);
document.addEventListener('pointermove', revealPresentationControls);
window.addEventListener('resize', () => {
  if (!getUI().presenting) return;
  clearTimeout(fullscreenCheckTimer);
  fullscreenCheckTimer = window.setTimeout(() => { void slideshow.sync().catch(notice); }, 150);
});
async function closeApplication() {
  if (switchingDocument || getUI().dialog || getUI().settingsOpen || composing) return;
  switchingDocument = true; update();
  try { await finish(); if (await guardUnsaved()) await invoke('close_application'); }
  finally { switchingDocument = false; update(); }
}
const openRequests = createOpenRequestPump({
  blocked: () => switchingDocument || composing || pending > 0 || !!getUI().dialog || getUI().settingsOpen || getUI().menuOpen,
  pending: () => invoke<string | null>('pending_open_request'),
  open: id => open(false, false, id),
  dismiss: requestId => invoke('dismiss_open_request', { requestId }),
  error: notice,
});
let nativeOpenReady = false;
subscribeUI(() => { if (nativeOpenReady) openRequests.wake(); });
document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => {
  // Allow the final composition input event to settle before committing text.
  setTimeout(() => { composing = false; if (nativeOpenReady) openRequests.wake(); }, 0);
});
void (async () => {
  await listen('close-requested', () => { void closeApplication().catch(notice); });
  await listen<string>('open-request-error', event => notice(event.payload));
  await listen('open-requested', () => openRequests.wake());
  nativeOpenReady = true;
  openRequests.wake();
})().catch(notice);
requestAnimationFrame(() => { void invoke<number>('frontend_ready', {userAgent:navigator.userAgent}).then(ms=>startupMs=ms).catch(notice); });
update();
