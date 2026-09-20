// Runs inside the opaque report sandbox. Every reply is untrusted display data;
// there is deliberately no file, edit, export or generic native-command bridge.
export function liveBridge(config: { channel: string; scroll: { x: number; y: number }; maxBytes: number }) {
  const send = (value: Record<string, unknown>) => parent.postMessage({ channel: config.channel, ...value }, '*');
  let lastPointer = 0;
  addEventListener('keydown', event => {
    if (event.isTrusted && event.key === 'Escape') send({ type: 'escape' });
  }, true);
  addEventListener('pointermove', () => {
    if (performance.now() - lastPointer > 500) { lastPointer = performance.now(); send({ type: 'pointer' }); }
  }, { passive: true });
  addEventListener('load', () => {
    requestAnimationFrame(() => {
      scrollTo(config.scroll.x, config.scroll.y);
      send({ type: 'ready' });
    });
  });
  addEventListener('message', event => {
    if (event.source !== parent || event.data?.channel !== config.channel
      || event.data?.type !== 'capture' || typeof event.data.id !== 'string') return;
    const id = event.data.id;
    try {
      const copy = document.documentElement.cloneNode(true) as HTMLElement;
      const originals = document.querySelectorAll('canvas');
      const canvases = copy.querySelectorAll('canvas');
      let imageBytes = 0;
      for (let i = 0; i < canvases.length; i++) {
        const canvas = originals[i];
        const style = getComputedStyle(canvas);
        if (style.display === 'none' || style.visibility === 'hidden') { canvases[i].remove(); continue; }
        const image = document.createElement('img');
        for (const attr of canvases[i].attributes) image.setAttribute(attr.name, attr.value);
        image.src = canvas.toDataURL('image/png');
        imageBytes += image.src.length;
        if (imageBytes > config.maxBytes) throw new Error('snapshot too large');
        image.style.width = style.width; image.style.height = style.height;
        image.alt = canvas.getAttribute('aria-label') ?? '';
        canvases[i].replaceWith(image);
      }
      // Freeze the currently rendered visual state, including CSS entrance
      // animations, instead of restarting animations in the static editor.
      const originalsAll = document.querySelectorAll('*');
      // Canvas replacements keep element ordering except for hidden canvases;
      // freeze animated styles by the original element's stable source marker
      // where available; the stylesheet below stops remaining CSS animation.
      for (const original of originalsAll) {
        if (!(original instanceof HTMLElement) || !original.getAnimations().length) continue;
        const marker = original.getAttribute('data-pagein-source');
        if (!marker) continue;
        const target = copy.querySelector<HTMLElement>(`[data-pagein-source="${marker.replace(/[^0-9:]/g, '')}"]`);
        if (!target) continue;
        const style = getComputedStyle(original);
        for (const key of ['opacity', 'transform', 'visibility']) target.style.setProperty(key, style.getPropertyValue(key), 'important');
      }
      const freeze = document.createElement('style');
      freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}';
      copy.querySelector('head')?.append(freeze);
      copy.querySelectorAll('script').forEach(script => script.remove());
      const html = '<!doctype html>' + copy.outerHTML;
      if (new TextEncoder().encode(html).length > config.maxBytes) throw new Error('snapshot too large');
      send({ type: 'snapshot', id, html, x: scrollX, y: scrollY });
    } catch { send({ type: 'capture-error', id }); }
  });
}
