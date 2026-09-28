import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsPoint, hasUnsupportedGeometry, isRendered, mappedText, minimumInputSize, writeMappedText } from '../src/input-geometry.ts';

function style(properties: Record<string, string> = {}) {
  return {
    writingMode: 'horizontal-tb', zoom: '1', fontSize: '20px', lineHeight: 'normal',
    display: 'block', visibility: 'visible', ...properties,
    getPropertyValue: (key: string) => properties[key] ?? 'none',
  } as CSSStyleDeclaration;
}
function tree(child: Record<string, string> = {}, parent: Record<string, string> = {}) {
  const ancestor = { parentElement: null } as unknown as Element;
  const element = { parentElement: ancestor } as unknown as Element;
  return { element, read: (target: Element) => style(target === element ? child : parent) };
}

test('independent transforms on the element and each ancestor remain read-only', () => {
  for (const [property, value] of Object.entries({ transform: 'matrix(1,0,0,1,0,0)', scale: '1.5', rotate: '20deg', translate: '10px 0px' })) {
    for (const ancestor of [false, true]) {
      const context = ancestor ? tree({}, { [property]: value }) : tree({ [property]: value });
      assert.equal(hasUnsupportedGeometry(context.element, context.read), true, `${property}, ancestor=${ancestor}`);
    }
  }
  const normal = tree();
  assert.equal(hasUnsupportedGeometry(normal.element, normal.read), false);
});

test('vertical text and zoom remain guarded and hidden ancestors have no empty hit targets', () => {
  const geometric: Record<string, string>[] = [{ writingMode: 'vertical-rl' }, { zoom: '1.2' }];
  for (const properties of geometric) {
    const context = tree({}, properties);
    assert.equal(hasUnsupportedGeometry(context.element, context.read), true);
  }
  const hidden: Record<string, string>[] = [{ display: 'none' }, { visibility: 'hidden' }, { 'content-visibility': 'hidden' }];
  for (const properties of hidden) {
    const context = tree({}, properties);
    assert.equal(isRendered(context.element, context.read), false);
  }
});

test('clearing or replacing mapped text preserves the same Text node', () => {
  const node = { nodeType: 3, data: 'original' };
  const element = { childNodes: [node], firstChild: node } as unknown as HTMLElement;
  assert.equal(writeMappedText(element, ''), true);
  assert.equal(node.data, '');
  assert.equal(mappedText(element), node);
  assert.equal(writeMappedText(element, 'new'), true);
  assert.equal(node.data, 'new');
  assert.equal(element.firstChild, node);
  assert.equal(writeMappedText({ childNodes: [] } as unknown as HTMLElement, 'unsafe'), false);
});

test('empty input has a usable caret box and a bounded minimum hit region', () => {
  assert.deepEqual(minimumInputSize(style()), { width: 12, height: 24 });
  assert.deepEqual(minimumInputSize(style({ fontSize: '40px', lineHeight: '50px' })), { width: 24, height: 50 });
  assert.equal(containsPoint({ left: 10, top: 20, width: 12, height: 24 }, 15, 25), true);
  assert.equal(containsPoint({ left: 10, top: 20, width: 12, height: 24 }, 22, 25), false);
});
