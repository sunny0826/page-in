import { playAsciiBackground, playPresentationEntries, playSlideTransition } from './presentation-motion.ts';

// Trusted navigation and display effects. Original page scripts stay disabled.
export function presentationSlides(doc: Document): HTMLElement[] {
  for (const selector of ['#deck', '.reveal > .slides', '.slides']) {
    const container = doc.querySelector(selector);
    if (!container) continue;
    const slides = Array.from(container.children).filter((el): el is HTMLElement =>
      el.namespaceURI === 'http://www.w3.org/1999/xhtml' && (el.matches('.slide') || el.tagName === 'SECTION'));
    // Nested/vertical decks need a different layout adapter.
    if (slides.length > 1 && !slides.some(slide => slide.querySelector('section.slide, section > section'))) return slides;
  }
  return [];
}

export function preparePresentation(doc: Document) {
  const slides = presentationSlides(doc);
  if (!slides.length) return null;
  const container = slides[0].parentElement!;
  doc.documentElement.removeAttribute('data-pagein-motion');
  container.setAttribute('data-pagein-deck', '');
  for (const slide of slides) slide.setAttribute('data-pagein-slide', '');
  const style = doc.createElement('style');
  style.textContent = `
    html, body { width:100%!important; height:100%!important; overflow:hidden!important; }
    [data-pagein-deck] { position:fixed!important; inset:0!important; width:100%!important; height:100%!important; display:block!important; transform:none!important; zoom:1!important; transition:none!important; }
    [data-pagein-slide] { position:absolute!important; inset:0!important; width:100vw!important; height:100vh!important; transform:none!important; opacity:1!important; visibility:visible!important; }
    [data-pagein-slide][hidden] { display:none!important; }
    html:not([data-pagein-motion]) [data-pagein-slide], html:not([data-pagein-motion]) [data-pagein-slide] *,
    html:not([data-pagein-motion]) [data-pagein-slide]::before, html:not([data-pagein-motion]) [data-pagein-slide]::after,
    html:not([data-pagein-motion]) [data-pagein-slide] *::before, html:not([data-pagein-motion]) [data-pagein-slide] *::after { animation:none!important; transition:none!important; }
    html:not([data-pagein-motion]) [data-pagein-slide] { translate:none!important; }
    html:not([data-pagein-motion]) [data-pagein-slide] [data-anim], html:not([data-pagein-motion]) [data-pagein-slide] .fragment { opacity:1!important; visibility:visible!important; transform:none!important; }
    html[data-pagein-motion] [data-pagein-slide] [data-anim], html[data-pagein-motion] [data-pagein-slide] .fragment { opacity:1; visibility:visible; transform:none; }
    #nav, #hint, #overview, .reveal > .controls, .reveal > .progress { display:none!important; }
  `;
  doc.head.append(style);
  let index = 0;
  let enabled = false;
  let disposed = false;
  let cleanups: Array<() => void> = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => { cleanups.forEach(cleanup => cleanup()); cleanups = []; };
  const showCurrent = () => slides.forEach((slide, i) => { slide.hidden = i !== index; });
  const isMoving = () => enabled && !reducedMotion.matches && !doc.body.classList.contains('low-power');
  const play = (offset = 0) => {
    cleanups.push(playPresentationEntries(slides[index], offset), playAsciiBackground(slides[index]));
  };
  function refreshMotion() {
    stop(); showCurrent();
    doc.documentElement.toggleAttribute('data-pagein-motion', isMoving());
    if (isMoving()) play();
  }
  reducedMotion.addEventListener('change', refreshMotion);
  function go(next: number) {
    if (disposed || !Number.isFinite(next)) return index;
    const target = Math.max(0, Math.min(slides.length - 1, Math.trunc(next)));
    if (target === index) return index;
    const previous = index;
    stop(); index = target; showCurrent();
    doc.body.classList.toggle('dark-bg', slides[index].matches('.dark, .accent'));
    if (isMoving()) {
      const direction = Math.sign(index - previous);
      cleanups.push(playSlideTransition(slides[previous], slides[index], direction));
      play(200);
    }
    return index;
  }
  showCurrent();
  doc.body.classList.toggle('dark-bg', slides[index].matches('.dark, .accent'));
  return {
    slides, go, get index() { return index; },
    setMotionEnabled(value: boolean) {
      if (disposed || value === enabled) return;
      enabled = value; refreshMotion();
    },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false; stop(); showCurrent();
      doc.documentElement.removeAttribute('data-pagein-motion');
      reducedMotion.removeEventListener('change', refreshMotion);
    },
  };
}
