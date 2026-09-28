type StyleReader = (element: Element) => CSSStyleDeclaration;
const readStyle: StyleReader = element => element.ownerDocument.defaultView!.getComputedStyle(element);

export function hasUnsupportedGeometry(element: Element, styleOf: StyleReader = readStyle): boolean {
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = styleOf(ancestor);
    if (['transform', 'translate', 'rotate', 'scale'].some(property => {
      const value = style.getPropertyValue(property);
      return value !== '' && value !== 'none';
    }) || !['', 'horizontal-tb'].includes(style.writingMode)
      || !['', '1', 'normal'].includes(style.zoom)) return true;
  }
  return false;
}

export function isRendered(element: Element, styleOf: StyleReader = readStyle): boolean {
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = styleOf(ancestor);
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)
      || style.getPropertyValue('content-visibility') === 'hidden') return false;
  }
  return true;
}

export function minimumInputSize(style: CSSStyleDeclaration) {
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  return { width: Math.max(12, fontSize * 0.6), height: Math.max(16, lineHeight) };
}

export function inputBounds(element: HTMLElement, frame: HTMLIFrameElement) {
  const rect = element.getBoundingClientRect();
  const origin = frame.getBoundingClientRect();
  const minimum = minimumInputSize(readStyle(element));
  return {
    left: rect.left + origin.left,
    top: rect.top + origin.top,
    width: Math.max(rect.width, minimum.width),
    height: Math.max(rect.height, minimum.height),
  };
}

export function containsPoint(rect: { left: number; top: number; width: number; height: number }, x: number, y: number) {
  return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;
}

// Avoid Element.textContent: assigning an empty value removes its Text node.
export function mappedText(element: HTMLElement): Text | null {
  return element.childNodes.length === 1 && element.firstChild?.nodeType === 3 ? element.firstChild as Text : null;
}

export function writeMappedText(element: HTMLElement, text: string): boolean {
  const node = mappedText(element);
  if (!node) return false;
  node.data = text;
  return true;
}
