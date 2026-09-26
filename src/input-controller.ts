import type { TextEntry } from './contracts.ts';
import { containsPoint, hasUnsupportedGeometry, inputBounds, isRendered, mappedText, minimumInputSize } from './input-geometry.ts';
import { createInputTransaction } from './input-transaction.ts';

interface InputOptions {
  frame: HTMLIFrameElement;
  entries: () => ReadonlyMap<HTMLElement, TextEntry>;
  sessionId: () => string | null;
  canBegin: () => boolean;
  value: (entry: TextEntry) => string;
  idle: () => Promise<void>;
  commit: (sessionId: string, entry: TextEntry, before: string, text: string) => Promise<void>;
  changed: () => void;
  error: (error: unknown) => void;
  label: (key: 'changed' | 'transform' | 'edit') => string;
}
interface ActiveInput {
  element: HTMLElement;
  input: HTMLDivElement;
  transaction: ReturnType<typeof createInputTransaction>;
}

export function createInputController(options: InputOptions) {
  const host = options.frame.ownerDocument;
  let active: ActiveInput | null = null;
  let generation = 0;
  let composing = false;
  let compositionEnded: (() => void) | null = null;
  let compositionFinish: Promise<void> | null = null;

  function position() {
    if (!active) return;
    const { left, top, width, height } = inputBounds(active.element, options.frame);
    Object.assign(active.input.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
  }
  function finishActive(cancel: boolean): Promise<void> {
    if (!active) return options.idle();
    active.transaction.setDraft(active.input.textContent ?? '');
    return active.transaction.finish(cancel);
  }
  function finish(cancel = false): Promise<void> {
    if (compositionFinish) return compositionFinish;
    if (!active || !composing) return finishActive(cancel);
    // The caller (including open/export/close) must wait for the final IME input
    // event, not commit a candidate or pass this transaction without saving it.
    compositionFinish = new Promise<void>(resolve => { compositionEnded = resolve; })
      .then(() => finishActive(cancel)).finally(() => { compositionFinish = null; });
    return compositionFinish;
  }
  function copyDraft() {
    if (!active || !active.transaction.setDraft(active.input.textContent ?? '')) return;
    const node = mappedText(active.element);
    if (node) node.data = active.transaction.draft;
    position();
  }
  async function begin(element: HTMLElement) {
    if (!options.canBegin() || active?.element === element) return;
    const sessionId = options.sessionId();
    const request = ++generation;
    await finish();
    if (request !== generation || !sessionId || sessionId !== options.sessionId() || !options.canBegin()
      || !element.isConnected || element.ownerDocument !== options.frame.contentDocument || active) return;
    const entry = options.entries().get(element);
    if (!entry) return;
    const expected = options.value(entry);
    const node = mappedText(element);
    if (!node || node.data !== expected) { options.error(options.label('changed')); return; }
    if (hasUnsupportedGeometry(element)) { options.error(options.label('transform')); return; }
    const computed = element.ownerDocument.defaultView!.getComputedStyle(element);
    if (!isRendered(element)) return;
    const input = host.createElement('div');
    for (const property of Array.from(computed)) {
      // WebKit's read-only value overrides contenteditable. Custom properties
      // belong to the user document and must not override shell focus tokens.
      if (property === '-webkit-user-modify' || property.startsWith('--')) continue;
      input.style.setProperty(property, computed.getPropertyValue(property));
    }
    Object.assign(input.style, {
      position: 'fixed', margin: '0', boxSizing: 'border-box', minWidth: '0', maxWidth: 'none',
      minHeight: '0', maxHeight: 'none', transform: 'none', translate: 'none', rotate: 'none', scale: 'none',
      animation: 'none', transition: 'none', display: 'block', visibility: 'visible', overflow: 'hidden',
      outline: '1.5px solid var(--focus)', outlineOffset: '5px', zIndex: '12', userSelect: 'text',
    });
    input.contentEditable = 'plaintext-only';
    input.spellcheck = false;
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', options.label('edit'));
    input.textContent = expected;
    const originalStyle = element.getAttribute('style');
    const transaction = createInputTransaction({
      before: expected,
      idle: options.idle,
      commit: text => options.commit(sessionId, entry, expected, text),
      pending: () => {
        input.contentEditable = 'false';
        input.setAttribute('aria-busy', 'true');
        options.changed();
      },
      complete: text => {
        node.data = text;
        if (originalStyle === null) element.removeAttribute('style'); else element.setAttribute('style', originalStyle);
        active = null;
        input.remove();
        options.changed();
      },
      recover: () => {
        input.contentEditable = 'plaintext-only';
        input.removeAttribute('aria-busy');
        input.focus({ preventScroll: true });
        options.changed();
      },
    });
    active = { element, input, transaction };
    element.style.visibility = 'hidden';
    host.body.append(input);
    position();
    input.addEventListener('input', () => { if (active?.input === input) copyDraft(); });
    input.addEventListener('blur', () => { if (active?.input === input) void finish().catch(options.error); });
    input.focus();
    const range = host.createRange();
    range.selectNodeContents(input);
    const selection = host.getSelection();
    selection?.removeAllRanges(); selection?.addRange(range);
    options.changed();
  }
  function hit(event: Pick<MouseEvent, 'clientX' | 'clientY'>): HTMLElement | null {
    const origin = options.frame.getBoundingClientRect();
    const target = options.frame.contentDocument?.elementFromPoint(event.clientX - origin.left, event.clientY - origin.top) as HTMLElement | null;
    // Empty text may have zero layout width/height. Its hit box exists only in
    // this trusted parent; no placeholder text or styling enters the document.
    for (const element of options.entries().keys()) {
      if (mappedText(element)?.data !== '' || !element.isConnected || hasUnsupportedGeometry(element)) continue;
      if (!isRendered(element)) continue;
      const style = element.ownerDocument.defaultView!.getComputedStyle(element);
      const bounds = { ...inputBounds(element, options.frame), ...minimumInputSize(style) };
      // Prefer this small box even when an adjacent inline fragment has flowed
      // into the cleared location; it must remain possible to reopen the empty one.
      if (containsPoint(bounds, event.clientX, event.clientY)) return element;
    }
    return target;
  }
  return {
    get active() { return active; },
    begin, finish, position, hit,
    invalidateBegin() { generation++; },
    setComposing(value: boolean) {
      composing = value;
      if (!value) { compositionEnded?.(); compositionEnded = null; }
    },
    beforeInput(event: InputEvent) {
      if (active && (active.transaction.phase !== 'editing' || event.inputType.startsWith('format')
        || ['insertParagraph', 'insertLineBreak'].includes(event.inputType))) event.preventDefault();
    },
    paste(event: ClipboardEvent) {
      if (!active) return;
      event.preventDefault();
      if (active.transaction.phase !== 'editing') return;
      const selection = host.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!active.input.contains(range.commonAncestorContainer)) return;
      range.deleteContents();
      const node = host.createTextNode(event.clipboardData?.getData('text/plain') ?? '');
      range.insertNode(node); range.setStartAfter(node); range.collapse(true);
      selection.removeAllRanges(); selection.addRange(range);
      copyDraft();
    },
  };
}
