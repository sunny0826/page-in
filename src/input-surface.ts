import type { TextEntry } from './contracts.ts';
import { t } from './i18n.ts';
import { createInputController } from './input-controller.ts';

// Wire shell events to the controller. Editing DOM stays in the trusted parent;
// the source Text node keeps its mapped identity.
export function createInputSurface(frame: HTMLIFrameElement, surface: HTMLElement, options: {
  canEdit: () => boolean;
  sessionId: () => string | null;
  slideWheel: (event: WheelEvent) => boolean;
  entries: () => Map<HTMLElement, TextEntry>;
  text: (entry: TextEntry) => string;
  commit: (sessionId: string, entry: TextEntry, before: string, text: string) => Promise<void>;
  settled: () => Promise<void>;
  changed: () => void;
  error: (error: unknown) => void;
}) {
  const input = createInputController({
    frame, entries: options.entries, sessionId: options.sessionId, canBegin: options.canEdit,
    value: options.text, commit: options.commit, idle: options.settled,
    changed: options.changed, error: options.error, label: t,
  });
  window.addEventListener('resize', input.position);
  document.addEventListener('beforeinput', input.beforeInput);
  document.addEventListener('paste', input.paste);
  surface.addEventListener('dblclick', event => {
    event.preventDefault();
    const target = input.hit(event);
    if (target && options.entries().has(target)) void input.begin(target).catch(options.error);
    else options.error(t('plainOnly'));
  });
  surface.addEventListener('pointerdown', () => { void input.finish().catch(options.error); });
  surface.addEventListener('wheel', event => {
    if (options.slideWheel(event)) return;
    event.preventDefault();
    const target = input.hit(event);
    void input.finish().then(() => {
      const doc = frame.contentDocument;
      if (!doc) return;
      let scroller: Element | null = target;
      while (scroller && scroller !== doc.documentElement) {
        const css = doc.defaultView!.getComputedStyle(scroller);
        if (/(auto|scroll)/.test(css.overflowY) && scroller.scrollHeight > scroller.clientHeight) break;
        scroller = scroller.parentElement;
      }
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? frame.clientHeight : 1;
      (scroller ?? doc.scrollingElement)?.scrollBy({ left: event.deltaX * unit, top: event.deltaY * unit });
    }).catch(options.error);
  }, { passive: false });
  return input;
}
