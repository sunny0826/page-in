import scrollbarStyles from './scrollbars.css?inline';

// Runs after source mapping and changes only the disposable preview document.
// Export continues to use the immutable source and its text patches.
export function stylePageScrollbars(doc: Document) {
  const win = doc.defaultView;
  if (!win || !doc.body || !doc.head) return;
  const root = win.getComputedStyle(doc.documentElement);
  const body = win.getComputedStyle(doc.body);
  const transparent = (color: string) => !color || color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color);
  // CSS propagates the body's background to the canvas when the root is clear.
  const background = !transparent(root.backgroundColor) ? root.backgroundColor
    : !transparent(body.backgroundColor) ? body.backgroundColor : '#ffffff';
  const style = doc.createElement('style');
  style.dataset.pageinScrollbars = '';
  const palette = {
    '--pagein-scrollbar-track': background,
    '--pagein-scrollbar-thumb': `color-mix(in srgb, ${body.color} 28%, ${background})`,
    '--pagein-scrollbar-hover': `color-mix(in srgb, ${body.color} 48%, ${background})`,
  };
  style.textContent = `:root {${Object.entries(palette).map(([key, value]) => `${key}: ${value};`).join('')}}\n${scrollbarStyles}`;
  doc.head.append(style);
  // WKWebView can paint an iframe's native scrollbar using the embedding
  // document's scrollbar rules. Keep both sides of that boundary in sync.
  const host = win.frameElement as HTMLElement | null;
  if (host) {
    for (const [key, value] of Object.entries(palette)) {
      host.style.setProperty(key, value);
      host.ownerDocument.documentElement.style.setProperty(key, value);
    }
  }
}
