import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyAction, type KeyContext } from '../src/keyboard.ts';

const context: KeyContext = { blocked: false, presenting: false, active: false, opened: true, inControl: false, slideIndex: 2, slideCount: 5 };
const key = { key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false };
const cases: [string, Partial<typeof key>, Partial<KeyContext>, ReturnType<typeof keyAction>][] = [
  ['next slide', { key: 'ArrowRight' }, {}, 3], ['previous slide', { key: 'PageUp' }, {}, 1],
  ['first slide', { key: 'Home' }, {}, 0], ['last slide', { key: 'End' }, {}, 4],
  ['report arrows', { key: 'ArrowRight' }, { slideCount: 0 }, null],
  ['control arrows', { key: 'ArrowRight' }, { inControl: true }, null],
  ['modified arrows', { key: 'ArrowRight', altKey: true }, {}, null],
  ['input arrows', { key: 'ArrowRight' }, { active: true }, null],
  ['present', { key: 'F5' }, {}, 'present'], ['exit', { key: 'Escape' }, { presenting: true }, 'exitPresentation'],
  ['commit', { key: 'Enter' }, { active: true }, 'finish'], ['cancel', { key: 'Escape' }, { active: true }, 'cancel'],
  ['export', { key: 's', metaKey: true }, {}, 'exportFile'],
  ['export active input', { key: 'S', ctrlKey: true }, { active: true }, 'exportFile'],
  ['undo', { key: 'z', ctrlKey: true }, {}, 'undo'], ['redo', { key: 'Z', metaKey: true, shiftKey: true }, {}, 'redo'],
  ['native input undo', { key: 'z', metaKey: true }, { active: true }, null],
  ['show is read-only', { key: 'z', metaKey: true }, { presenting: true }, null],
  ['show cannot export', { key: 's', ctrlKey: true }, { presenting: true }, null],
  ['no document', { key: 's', ctrlKey: true }, { opened: false }, null],
  ['composition', { key: 'Enter', isComposing: true }, { active: true }, null],
  ['modal', { key: 'Escape' }, { presenting: true, blocked: true }, null],
  ['unknown key', { key: 'constructor' }, {}, null],
];
for (const [name, event, state, expected] of cases) {
  test(name, () => assert.equal(keyAction({ ...key, ...event }, { ...context, ...state }), expected));
}
