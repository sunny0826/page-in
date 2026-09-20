type Step = { selector: string; transform?: string; delay?: number; step?: number; group?: boolean };
const recipes: Record<string, Step[]> = {
  hero: [{ selector: '[data-anim="title"], .cover-row', transform: 'translateX(-18px)', delay: 150, step: 180 }],
  statement: [{ selector: '[data-anim="title"], [data-anim="lead"], .half', transform: 'translateY(20px)', delay: 100, step: 250 }],
  'bar-grow': [
    { selector: '.row-fill', transform: 'scaleX(0)', step: 100, group: true },
    { selector: '.row-lbl', transform: 'translateX(-12px)', delay: 250, step: 100 },
    { selector: '.row-val', transform: 'translateY(0)', delay: 650, step: 100 },
  ],
  'duo-mirror': [
    { selector: '.duo-compare .col:first-child', transform: 'translateX(-24px)', group: true },
    { selector: '.duo-compare .col:last-child', transform: 'translateX(24px)', delay: 550 },
    { selector: '.vrule', transform: 'scaleY(0)', delay: 400 },
  ],
  'stack-build': [{ selector: '.stack-block', transform: 'translateY(22px) scaleY(0.9)', step: 160, group: true }],
  'three-forces': [
    { selector: '.three-forces > div:first-child', transform: 'translateX(-26px)', group: true },
    { selector: '.three-forces .card-fill, .three-forces .force-card', transform: 'translateX(28px)', delay: 550, step: 180 },
  ],
  'grid-reveal': [{ selector: '.sub-card, .cell-6 > .cell', transform: 'translateY(20px) scale(0.96)', step: 90, group: true }],
  'matrix-fill': [{ selector: '.matrix-fill > *', transform: 'translateY(14px) scale(0.96)', step: 55, group: true }],
  'field-notes': [{ selector: '.brief-grid > *', group: true }],
  'four-cards': [
    { selector: '.four-cards > *', step: 130, group: true },
    { selector: '[data-anim="line"]', transform: 'scaleX(0)', delay: 100 },
  ],
  'split-statement': [
    { selector: '[data-anim="manifesto"], .kpi-thin', transform: 'translateY(24px)', delay: 150, step: 250 },
    { selector: '[data-anim="rules"] > *, .takeaway-list li', transform: 'translateX(20px)', delay: 450, step: 120 },
  ],
};

// Reviewed display recipes, never code or animation parameters read from document scripts.
type Entry = { element: HTMLElement; transform: string; delay: number };
const ease = 'cubic-bezier(0.2, 0, 0.38, 0.9)';

export function playSlideTransition(previous: HTMLElement, current: HTMLElement, direction: number): () => void {
  let incoming: Animation | undefined;
  let outgoing: Animation | undefined;
  const completions: Promise<Animation>[] = [];
  let active = true;
  const settle = () => {
    if (!active) return;
    active = false;
    // Hide before cancelling the retained endpoint so the old page cannot flash back.
    previous.hidden = true;
    incoming?.cancel(); outgoing?.cancel();
  };
  previous.hidden = false;
  try {
    const options: KeyframeAnimationOptions = {
      duration: 550, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'both',
    };
    incoming = current.animate([{ translate: `${direction * 100}% 0` }, { translate: '0 0' }], options);
    completions.push(incoming.finished);
    outgoing = previous.animate([{ translate: '0 0' }, { translate: `${-direction * 100}% 0` }], options);
    completions.push(outgoing.finished);
  } catch {
    // Missing/failed animation support must leave a readable single page.
    settle();
  }
  // WKWebView suppresses animation finish events in a script-disabled iframe.
  // Its finished promises still resolve into the trusted parent execution context.
  // Also consume cancellation rejections, including partially created transitions.
  void Promise.all(completions).then(settle, settle);
  return settle;
}

export function presentationEntries(slide: HTMLElement): Entry[] {
  const entries = new Map<HTMLElement, Entry>();
  const add = (selector: string, transform = 'translateY(18px)', delay = 250, step = 110) => {
    for (const [i, element] of Array.from(slide.querySelectorAll<HTMLElement>(selector)).entries()) {
      if (entries.size >= 160) break;
      entries.set(element, { element, transform, delay: Math.min(1800, delay + i * step) });
    }
  };
  add('[data-anim]', 'translateY(14px)', 0, 90);
  add('[data-anim="left"]', 'translateX(-24px)');
  add('[data-anim="right"]', 'translateX(24px)');
  const recipe = slide.dataset.animate;
  // Group containers stay visible when their children have their own choreography.
  const group = (selector: string, transform = 'translateY(18px)', step = 110) => {
    if (!slide.querySelector(selector)) return;
    for (const element of slide.querySelectorAll<HTMLElement>('[data-anim="up"]')) entries.delete(element);
    add(selector, transform, 350, step);
  };
  for (const entry of recipe && Object.hasOwn(recipes, recipe) ? recipes[recipe] : []) {
    if (entry.group) group(entry.selector, entry.transform, entry.step);
    else add(entry.selector, entry.transform, entry.delay, entry.step);
  }
  if (recipe === 'split-statement') {
    for (const element of slide.querySelectorAll<HTMLElement>('[data-anim="rules"]')) entries.delete(element);
  }
  return [...entries.values()];
}

export function playPresentationEntries(slide: HTMLElement, offset = 0): () => void {
  const animations: Animation[] = [];
  for (const { element, transform, delay } of presentationEntries(slide)) {
    const computed = slide.ownerDocument.defaultView!.getComputedStyle(element);
    const end = computed.transform === 'none' ? '' : computed.transform;
    animations.push(element.animate([
      { opacity: 0, transform: `${end} ${transform}`.trim(), transformOrigin: 'left center' },
      { opacity: computed.opacity, transform: end || 'none', transformOrigin: 'left center' },
    ], { duration: 550, delay: delay + offset, easing: ease, fill: 'backwards' }));
  }
  return () => animations.forEach(animation => animation.cancel());
}

// A bounded, decorative field for the known ASCII background marker. No source JS is run.
export function playAsciiBackground(slide: HTMLElement): () => void {
  const frameElement = slide.ownerDocument.defaultView?.frameElement;
  if (!frameElement) return () => {};
  // Script-disabled documents display canvas fallback content, not its bitmap.
  // Keep drawing in the trusted shell; source canvases supply geometry only.
  const surfaces = Array.from(slide.querySelectorAll<HTMLCanvasElement>('canvas.ascii-bg')).slice(0, 2)
    .map(marker => {
      const canvas = frameElement.ownerDocument.createElement('canvas');
      canvas.className = 'presentation-background';
      canvas.setAttribute('aria-hidden', 'true');
      frameElement.ownerDocument.body.append(canvas);
      return { marker, canvas, context: canvas.getContext('2d') };
    });
  if (!surfaces.length) return () => {};
  const palette = '   ...:::---+++***◦◦••▢▣';
  let frame = 0;
  let last = -Infinity;
  const start = performance.now();
  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (now - last < 1000 / 30 || slide.ownerDocument.hidden) return;
    last = now;
    const t = (now - start) / 1000 * 0.55;
    const frameRect = frameElement.getBoundingClientRect();
    for (const { marker, canvas, context } of surfaces) {
      if (!context) continue;
      const rect = marker.getBoundingClientRect();
      canvas.hidden = !rect.width || !rect.height;
      if (canvas.hidden) continue;
      Object.assign(canvas.style, {
        left: `${frameRect.left + rect.left}px`, top: `${frameRect.top + rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        clipPath: `inset(${Math.max(0, -rect.top)}px ${Math.max(0, rect.right - frameRect.width)}px ${Math.max(0, rect.bottom - frameRect.height)}px ${Math.max(0, -rect.left)}px)`,
      });
      const scale = Math.min(window.devicePixelRatio || 1, 2, 2048 / Math.max(rect.width, rect.height));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const cell = Math.max(16, Math.sqrt(rect.width * rect.height / 5800));
      const cols = Math.ceil(rect.width / cell), rows = Math.ceil(rect.height / cell);
      context.font = '500 13px monospace';
      context.textBaseline = 'top';
      for (let r = 0, count = 0; r < rows; r++) {
        for (let c = 0; c < cols && count++ < 6000; c++) {
          const n = (Math.sin(c * 0.18 + t) + Math.sin(r * 0.24 - t * 0.7)
            + Math.sin((c + r) * 0.12 + t * 0.45)
            + Math.sin(Math.hypot(c - cols / 2, r - rows / 2) * 0.16 - t * 0.55)) / 4;
          const v = (n + 1) / 2;
          if (v < 0.22) continue;
          const char = palette[Math.min(palette.length - 1, Math.floor(v * palette.length))];
          if (char === ' ') continue;
          context.fillStyle = `rgba(255,255,255,${0.08 + (v - 0.22) * 0.55})`;
          context.fillText(char, c * cell, r * cell);
        }
      }
    }
  };
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    for (const { canvas } of surfaces) canvas.remove();
  };
}
