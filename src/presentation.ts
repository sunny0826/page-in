// Trusted navigation for static HTML decks. Original page scripts stay disabled.
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
  container.setAttribute('data-pagein-deck', '');
  for (const slide of slides) slide.setAttribute('data-pagein-slide', '');
  const style = doc.createElement('style');
  style.textContent = `
    html, body { width:100%!important; height:100%!important; overflow:hidden!important; }
    [data-pagein-deck] { position:fixed!important; inset:0!important; width:100%!important; height:100%!important; display:block!important; transform:none!important; zoom:1!important; transition:none!important; }
    [data-pagein-slide] { position:absolute!important; inset:0!important; width:100vw!important; height:100vh!important; transform:none!important; opacity:1!important; visibility:visible!important; }
    [data-pagein-slide][hidden] { display:none!important; }
    [data-pagein-slide] *, [data-pagein-slide] { animation:none!important; transition:none!important; }
    [data-pagein-slide] [data-anim], [data-pagein-slide] .fragment { opacity:1!important; visibility:visible!important; transform:none!important; }
    #nav, #hint, #overview, .reveal > .controls, .reveal > .progress { display:none!important; }
  `;
  doc.head.append(style);
  let index = 0;
  function go(next: number) {
    index = Math.max(0, Math.min(slides.length - 1, next));
    slides.forEach((slide, i) => { slide.hidden = i !== index; });
    doc.body.classList.toggle('dark-bg', slides[index].matches('.dark, .accent'));
    return index;
  }
  go(0);
  return { slides, go, get index() { return index; } };
}
