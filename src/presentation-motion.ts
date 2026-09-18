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
  switch (recipe) {
    case 'hero':
      add('[data-anim="title"], .cover-row', 'translateX(-18px)', 150, 180);
      break;
    case 'statement':
      add('[data-anim="title"], [data-anim="lead"], .half', 'translateY(20px)', 100, 250);
      break;
    case 'bar-grow':
      group('.row-fill', 'scaleX(0)', 100);
      add('.row-lbl', 'translateX(-12px)', 250, 100);
      add('.row-val', 'translateY(0)', 650, 100);
      break;
    case 'duo-mirror':
      group('.duo-compare .col:first-child', 'translateX(-24px)');
      add('.duo-compare .col:last-child', 'translateX(24px)', 550);
      add('.vrule', 'scaleY(0)', 400);
      break;
    case 'stack-build':
      group('.stack-block', 'translateY(22px) scaleY(0.9)', 160);
      break;
    case 'three-forces':
      group('.three-forces > div:first-child', 'translateX(-26px)');
      add('.three-forces .card-fill, .three-forces .force-card', 'translateX(28px)', 550, 180);
      break;
    case 'grid-reveal':
      group('.sub-card, .cell-6 > .cell', 'translateY(20px) scale(0.96)', 90);
      break;
    case 'matrix-fill':
      group('.matrix-fill > *', 'translateY(14px) scale(0.96)', 55);
      break;
    case 'field-notes':
      group('.brief-grid > *', 'translateY(18px)', 110);
      break;
    case 'four-cards':
      group('.four-cards > *', 'translateY(18px)', 130);
      add('[data-anim="line"]', 'scaleX(0)', 100);
      break;
    case 'split-statement':
      add('[data-anim="manifesto"], .kpi-thin', 'translateY(24px)', 150, 250);
      add('[data-anim="rules"] > *, .takeaway-list li', 'translateX(20px)', 450, 120);
      for (const element of slide.querySelectorAll<HTMLElement>('[data-anim="rules"]')) entries.delete(element);
      break;
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
