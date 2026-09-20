import { getCurrentWindow } from '@tauri-apps/api/window';
import { createSlideshow } from './slideshow.ts';
import { getUI, updateUI } from './ui-state.ts';
import { t } from './i18n.ts';
import type { preparePresentation } from './presentation.ts';

export function createPresentationControls(surface: HTMLElement, options: {
  previewFrame: () => HTMLIFrameElement;
  presentation: () => ReturnType<typeof preparePresentation>;
  editing: () => boolean; setMode: (value: boolean) => Promise<void>; hasDocument: () => boolean;
  finish: () => Promise<void>; enqueue: <T>(action: () => Promise<T>) => Promise<T>;
  error: (error: unknown) => void;
}) {
  let lastSlideWheel = 0, controlsTimer = 0, fullscreenCheckTimer = 0;
  let restoreEditing = false;
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
    document.documentElement.classList.toggle('slideshow', value);
    updateUI({ presenting: value, presentationControls: true });
    if (value) void options.setMode(false).catch(options.error);
    else void options.enqueue(() => options.setMode(restoreEditing)).catch(options.error);
    clearTimeout(controlsTimer);
    if (value) revealPresentationControls();
    requestAnimationFrame(() => {
      if (value) {
        if (options.presentation()) surface.focus({ preventScroll: true });
        else options.previewFrame().contentWindow?.focus();
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
    if (!options.hasDocument() || getUI().busy || getUI().presenting || getUI().dialog || getUI().settingsOpen) return;
    await options.finish();
    restoreEditing = options.editing();
    await options.enqueue(async () => { await options.setMode(false); await slideshow.enter(); });
  }
  function exitSlideshow() { return options.enqueue(() => slideshow.exit()); }

  async function goSlide(index: number) {
    await options.finish();
    const deck = options.presentation();
    if (deck) updateUI({ slideIndex: deck.go(index) });
  }
  function slideWheel(event: WheelEvent) {
    const deck = options.presentation();
    if (!deck) return false;
    if (getUI().activeInput || getUI().dialog || getUI().settingsOpen || event.ctrlKey) return true;
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 8 || performance.now() - lastSlideWheel < 450) return true;
    lastSlideWheel = performance.now();
    void goSlide(deck.index + Math.sign(delta)).catch(options.error);
    return true;
  }

  document.addEventListener('pointermove', revealPresentationControls);
  window.addEventListener('resize', () => {
    if (!getUI().presenting) return;
    clearTimeout(fullscreenCheckTimer);
    fullscreenCheckTimer = window.setTimeout(() => { void slideshow.sync().catch(options.error); }, 150);
  });
  return { enter: startSlideshow, exit: exitSlideshow, go: goSlide, wheel: slideWheel, reveal: revealPresentationControls };
}
