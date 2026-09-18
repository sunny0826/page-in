import { html, type DefaultTreeAdapterTypes } from 'parse5';
import type { DocumentFormat } from './contracts.ts';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;
const isElement = (node: Node): node is Element =>
  'tagName' in node && node.namespaceURI === html.NS.HTML;
const classes = (node: Element) =>
  (node.attrs.find(attr => attr.name === 'class')?.value ?? '').split(/\s+/);

// Classify the sanitized static tree, without executing scripts or changing it.
// Continuous HTML is the report fallback; filenames and prose are not evidence.
export function detectDocumentFormat(tree: Node): DocumentFormat {
  const pending = [tree];
  while (pending.length) {
    const node = pending.pop()!;
    const children = 'childNodes' in node ? node.childNodes : [];
    if (isElement(node)) {
      const elements = children.filter(isElement);
      const names = classes(node);
      const deck = node.attrs.some(attr => attr.name === 'id' && attr.value === 'deck')
        || names.includes('slides') || names.includes('slide-deck');
      if (deck && elements.some(child => child.tagName === 'section' || classes(child).includes('slide'))) {
        return 'presentation';
      }
      // Standalone HTML decks also commonly use sibling section.slide pages.
      if (elements.filter(child => child.tagName === 'section' && classes(child).includes('slide')).length >= 2) {
        return 'presentation';
      }
    }
    pending.push(...children);
  }
  return 'report';
}
