// Resolve intent before running asynchronous actions. Modal/composition guards
// live at the boundary; active typing keeps the browser's native undo history.
export type KeyAction = 'present' | 'exitPresentation' | 'finish' | 'cancel' | 'exportFile' | 'undo' | 'redo';
export type KeyContext = {
  blocked: boolean; presenting: boolean; active: boolean; opened: boolean;
  inControl: boolean; slideIndex: number; slideCount: number;
};
const slideSteps: Record<string, number> = {
  ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1,
  ArrowLeft: -1, ArrowUp: -1, PageUp: -1,
};
export function keyAction(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'>,
  context: KeyContext): KeyAction | number | null {
  if (context.blocked || event.isComposing) return null;
  const { key } = event;
  const modified = event.metaKey || event.ctrlKey || event.altKey;
  if (context.presenting && key === 'Escape') return 'exitPresentation';
  if (!modified && key === 'F5') return 'present';
  if (context.slideCount && !context.active && !context.inControl && !modified) {
    if (key === 'Home') return 0;
    if (key === 'End') return context.slideCount - 1;
    if (Object.hasOwn(slideSteps, key)) return context.slideIndex + slideSteps[key];
  }
  if (context.active && key === 'Escape') return 'cancel';
  if (context.active && key === 'Enter') return 'finish';
  if (context.presenting || !context.opened || !(event.metaKey || event.ctrlKey)) return null;
  if (key.toLowerCase() === 's') return 'exportFile';
  if (key.toLowerCase() === 'z' && !context.active) return event.shiftKey ? 'redo' : 'undo';
  return null;
}
