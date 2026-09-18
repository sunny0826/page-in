import type { TextEntry } from './contracts.ts';
import { t } from './i18n.ts';

// Temporary editable DOM lives in the trusted parent, never the source document.
export function createInputSurface(frame: HTMLIFrameElement, surface: HTMLElement, options: {
  canEdit: () => boolean;
  slideWheel: (event: WheelEvent) => boolean;
  entries: () => Map<HTMLElement, TextEntry>;
  text: (entry: TextEntry) => string;
  commit: (entry: TextEntry, before: string, text: string) => Promise<void>;
  settled: () => Promise<void>;
  changed: () => void;
  error: (error: unknown) => void;
}) {
  let active: { element: HTMLElement; input: HTMLDivElement; entry: TextEntry; before: string; style: string | null } | null = null;
  // Only leaf elements with one mapped Text node can enter this transaction.
  function finish(cancel = false): Promise<void> {
    if (!active) return options.settled();
    const transaction = active;
    active = null;
    const text = cancel ? transaction.before : transaction.input.textContent ?? '';
    transaction.input.remove();
    if (transaction.style === null) transaction.element.removeAttribute('style');
    else transaction.element.setAttribute('style', transaction.style);
    transaction.element.textContent = text;
    if (text === transaction.before) { options.changed(); return options.settled(); }
    return options.commit(transaction.entry, transaction.before, text).catch(error => {
      transaction.element.textContent = transaction.before;
      throw error;
    });
  }
  async function begin(element: HTMLElement) {
    if (!options.canEdit() || active?.element === element) return;
    await finish();
    const entry = options.entries().get(element);
    if (!entry) return;
    const expected = options.text(entry);
    if (element.textContent !== expected || element.childNodes.length !== 1 || element.firstChild?.nodeType !== Node.TEXT_NODE) { options.error(t('changed')); return; }
    const computed = element.ownerDocument.defaultView!.getComputedStyle(element);
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = element.ownerDocument.defaultView!.getComputedStyle(ancestor);
      if (style.transform !== 'none' || style.writingMode !== 'horizontal-tb' || !['1', 'normal'].includes(style.zoom)) {
        options.error(t('transform')); return;
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
    Object.assign(input.style, { position: 'fixed', margin: '0', boxSizing: 'border-box', minWidth: '0', maxWidth: 'none', minHeight: '0', maxHeight: 'none', transform: 'none', animation: 'none', transition: 'none', display: 'block', visibility: 'visible', overflow: 'hidden', outline: '1.5px solid var(--focus)', outlineOffset: '5px', zIndex: '12', userSelect: 'text' });
    input.contentEditable = 'plaintext-only';
    input.spellcheck = false;
    input.setAttribute('role', 'textbox');
    input.setAttribute('aria-label', t('edit'));
    input.textContent = expected;
    active = { element, input, entry, before: expected, style: element.getAttribute('style') };
    element.style.visibility = 'hidden';
    document.body.append(input);
    positionInput();
    input.addEventListener('input', () => { if (active?.input === input) { element.textContent = input.textContent; positionInput(); } });
    input.addEventListener('blur', () => { if (active?.input === input) void finish().catch(options.error); });
    input.focus();
    const range = document.createRange();
    range.selectNodeContents(input);
    const selection = document.getSelection();
    selection?.removeAllRanges(); selection?.addRange(range);
    options.changed();
  }
  function positionInput() {
    if (!active) return;
    const rect = active.element.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    Object.assign(active.input.style, {left: rect.left + frameRect.left + "px", top: rect.top + frameRect.top + "px", width: rect.width + "px", height: rect.height + "px"});
  }
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

  function hit(event: MouseEvent): HTMLElement | null {
    const rect = frame.getBoundingClientRect();
    return frame.contentDocument?.elementFromPoint(event.clientX - rect.left, event.clientY - rect.top) as HTMLElement | null;
  }
  surface.addEventListener("dblclick", event => {
    event.preventDefault();
    const target = hit(event);
    if (target && options.entries().has(target)) void begin(target).catch(options.error);
    else options.error(t('plainOnly'));
  });
  surface.addEventListener("pointerdown", () => { void finish().catch(options.error); });
  surface.addEventListener("wheel", event => {
    if (options.slideWheel(event)) return;
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
    }).catch(options.error);
  }, {passive: false});

  return { finish, get active() { return active; }, clear() { active?.input.remove(); active = null; } };
}
