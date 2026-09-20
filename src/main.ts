import { keyAction } from './keyboard.ts';
import { createInputSurface } from './input-surface.ts';
import './style.css';
import './styles/welcome.css';
import './styles/editor.css';
import './styles/dialogs.css';
import './styles/motion.css';
import { createOpenRequestPump } from './open-request-pump.ts';
import './scrollbars.css';
import { parseInWorker, mapElements, loadFrame } from './document-frame.ts';
import { preparePresentation } from './presentation.ts';
import { createLivePreview } from './live-preview.ts';
import { createPresentationControls } from './presentation-controls.ts';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { emptySession, type OpenedDocument, type ParsedDocument, type SessionView, type TextEntry } from './contracts.ts';
import { getLocale, subscribeLocale, t, localizeError } from './i18n.ts';
import { mountShell } from './shell.tsx';
import { closeDialog, getUI, showDialog, updateUI, subscribeUI } from './ui-state.ts';

document.documentElement.classList.toggle('macos', /Mac/.test(navigator.platform));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const frame = $<HTMLIFrameElement>('page');
const liveFrame = $<HTMLIFrameElement>('live-page');
const surface = $('input-surface');
function syncLocale() {
  document.documentElement.lang = getLocale() === 'zh' ? 'zh-CN' : 'en';
  frame.title = t('htmlPage');
  liveFrame.title = t('htmlPage');
}
syncLocale();
subscribeLocale(syncLocale);
let opened: OpenedDocument | null = null;
let parsed: ParsedDocument | null = null;
let view: SessionView = emptySession();
let elements = new Map<HTMLElement, TextEntry>();
let editing = false;
let pipeline = Promise.resolve();
let pending = 0;
let switchingDocument = false;
let composing = false;
let noticeTimer = 0;
let parseMs = 0;
let startupMs = 0;
let presentation: ReturnType<typeof preparePresentation> = null;
let liveScroll = { x: 0, y: 0 };
const live = createLivePreview(liveFrame, {
  escape: () => { if (getUI().presenting) void controls.exit().catch(notice); },
  pointer: () => controls.reveal(),
});
const input = createInputSurface(frame, surface, {
  slideWheel: event => controls.wheel(event),
  canEdit: () => editing && !switchingDocument,
  entries: () => elements,
  text: entry => view.texts[entry.nodeId] ?? entry.originalDecoded,
  commit: (entry, before, text) => enqueue(async () => sync(await invoke<SessionView>('commit_edit', {
    sessionId: opened!.sessionId, expectedRevision: view.revision,
    nodeId: entry.nodeId, oldText: before, newText: text,
  }))),
  settled: () => pipeline, changed: update, error: notice,
});
const controls = createPresentationControls(surface, {
  previewFrame: () => live.active ? liveFrame : frame,
  presentation: () => presentation, editing: () => editing, setMode,
  hasDocument: () => !!opened, finish: () => input.finish(), enqueue, error: notice,
});
function notice(message: unknown) {
  clearTimeout(noticeTimer);
  updateUI({ notice: localizeError(message) });
  noticeTimer = window.setTimeout(() => updateUI({ notice: null }), 6000);
}
function update() {
  updateUI({ busy: pending > 0 || switchingDocument, dirty: view.dirty, canUndo: view.canUndo, canRedo: view.canRedo, activeInput: !!input.active });
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
    if (element !== input.active?.element && element.textContent !== text) element.textContent = text;
  }
  update();
}
async function setMode(value: boolean) {
  if (parsed?.live && opened) {
    const { buildLiveDocument, mapLiveElements } = await import('./live-document.ts');
    if (value && live.active) {
      const snapshot = await live.capture();
      const clean = await parseInWorker(snapshot.html, opened.resourceBase);
      const doc = await loadFrame(frame, clean.html);
      elements = mapLiveElements(doc, parsed.entries, view.texts);
      attachDocumentEvents(doc);
      liveScroll = { x: snapshot.x, y: snapshot.y };
      doc.defaultView?.scrollTo(liveScroll.x, liveScroll.y);
      live.stop();
    } else if (!value && !live.active) {
      if (editing && frame.contentWindow) liveScroll = { x: frame.contentWindow.scrollX, y: frame.contentWindow.scrollY };
      const channel = crypto.randomUUID();
      const html = buildLiveDocument(opened.source, opened.resourceBase, parsed.entries, view.texts, channel, liveScroll);
      const url = await invoke<string>('prepare_preview', { sessionId: opened.sessionId, expectedRevision: view.revision, html });
      await live.load(url, channel);
      frame.hidden = true;
    }
  }
  presentation?.setMotionEnabled(getUI().presenting && !value);
  editing = value;
  surface.hidden = !value && !presentation;
  surface.tabIndex = presentation ? 0 : -1;
  if (presentation) surface.focus({ preventScroll: true });
  updateUI({ editing: value, notice: null });
  clearTimeout(noticeTimer);
}
function attachDocumentEvents(doc: Document) {
  doc.addEventListener('dragover', preventFileDrop);
  doc.addEventListener('drop', preventFileDrop);
  doc.addEventListener('keydown', keyboard);
  doc.addEventListener('wheel', controls.wheel, { passive: false });
  doc.addEventListener('pointermove', controls.reveal);
}
// Native drop owns file access; never let the browser navigate to a dropped file.
function preventFileDrop(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
}
document.addEventListener('dragover', preventFileDrop);
document.addEventListener('drop', event => {
  if (editing) event.preventDefault();
  preventFileDrop(event);
});
async function open(command: 'open_document' | 'open_project' | 'open_sample' | 'open_requested_document' = 'open_document', requestId?: string) {
  if (switchingDocument) return;
  switchingDocument = true; update();
  try {
    if (getUI().presenting) await controls.exit();
    await input.finish();
    if (!await guardUnsaved()) return;
    await enqueue(async () => {
      const next = await invoke<OpenedDocument | null>(command, { locale: getLocale(), requestId });
      if (!next) return;
      let activated = false;
      try {
        const start = performance.now();
        const result = await parseInWorker(next.source, next.resourceBase);
        // The bundled editing demo also serves as a script-stripping fixture.
        if (command === 'open_sample') result.live = false;
        parseMs = performance.now() - start;
        const registered = await invoke<SessionView>('register_manifest', { sessionId: next.sessionId, entries: result.entries });
        activated = true;
        presentation?.dispose();
        live.stop(); liveScroll = { x: 0, y: 0 };
        opened = next; parsed = result;
        const doc = await loadFrame(frame, result.html);
        elements = mapElements(doc, result.entries);
        const mapFailures = result.entries.length - elements.size;
        sync(registered);
        presentation = preparePresentation(doc);
        attachDocumentEvents(doc);
        updateUI({ filename: next.filename, documentFormat: result.format, project: next.project, slideIndex: 0, slideCount: presentation?.slides.length ?? 0 }); await setMode(false);
        if (result.warnings.length || mapFailures) showDialog(t('support'), [...result.warnings.map(localizeError), ...(mapFailures ? [t('mapping', { count: mapFailures })] : [])].join('\n'), [{ label: t('preview'), icon: 'eye', action: closeDialog }]);
      } catch (error) {
        if (!activated) throw error; // Reading or parsing failure keeps the active document intact.
        // The native session changed; never keep an old page attached to its resource token.
        input.clear(); surface.hidden = true; opened = null; parsed = null; elements.clear(); frame.srcdoc = ''; frame.hidden = true;
        presentation?.dispose(); presentation = null;
        live.stop();
        editing = false; updateUI({ filename: null, documentFormat: null, project: false, slideCount: 0, slideIndex: 0, editing: false });
        view = emptySession();
        throw error;
      }
    });
  } finally { switchingDocument = false; update(); }
}
async function exportFile(): Promise<boolean> {
  await input.finish();
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
async function history(command: string) { await input.finish(); await enqueue(async () => sync(await invoke<SessionView>(command, { sessionId: opened!.sessionId, expectedRevision: view.revision }))); }
function keyboard(event: KeyboardEvent) {
  const state = getUI();
  const action = keyAction(event, {
    blocked: switchingDocument || !!state.dialog || state.settingsOpen,
    presenting: state.presenting, active: !!input.active, opened: !!opened,
    inControl: event.target instanceof Element && !!event.target.closest('button, input, select, textarea, [contenteditable]'),
    slideIndex: presentation?.index ?? 0, slideCount: presentation?.slides.length ?? 0,
  });
  if (action === null) return;
  event.preventDefault();
  const actions = {
    present: controls.enter, exitPresentation: controls.exit,
    finish: () => input.finish(), cancel: () => input.finish(true), exportFile,
    undo: () => history('undo_edit'), redo: () => history('redo_edit'),
  };
  void (typeof action === 'number' ? controls.go(action) : actions[action]()).catch(notice);
}
function settings() {
  void input.finish().then(() => updateUI({ settingsOpen: true, diagnostics: {
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
    { label: t('openProject'), icon: 'project', primary: true, action: () => { closeDialog(); void open('open_project').catch(notice); } },
  ]); },
  previousSlide: () => { if (presentation) void controls.go(presentation.index - 1).catch(notice); },
  nextSlide: () => { if (presentation) void controls.go(presentation.index + 1).catch(notice); },
  sample: () => { void open('open_sample').catch(notice); },
  edit: () => { void enqueue(() => setMode(true)).catch(notice); },
  preview: () => { void input.finish().then(() => enqueue(() => setMode(false))).catch(notice); },
  present: () => { void controls.enter().catch(notice); },
  exitPresentation: () => { void controls.exit().catch(notice); },
  exportFile: () => { void exportFile().catch(notice); },
  undo: () => { void history('undo_edit').catch(notice); },
  redo: () => { void history('redo_edit').catch(notice); },
  settings,
});
document.addEventListener('keydown', keyboard);
async function closeApplication() {
  if (switchingDocument || getUI().dialog || getUI().settingsOpen || composing) return;
  switchingDocument = true; update();
  try { await input.finish(); if (await guardUnsaved()) await invoke('close_application'); }
  finally { switchingDocument = false; update(); }
}
const openRequests = createOpenRequestPump({
  blocked: () => switchingDocument || composing || pending > 0 || !!getUI().dialog || getUI().settingsOpen,
  pending: () => invoke<string | null>('pending_open_request'),
  open: id => open('open_requested_document', id),
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
