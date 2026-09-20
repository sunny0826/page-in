import type { DocumentFormat } from './contracts.ts';

export type DialogAction = {
  label: string;
  icon?: "close" | "trash" | "export" | "check" | "eye" | "file" | "project";
  action: () => void;
  primary?: boolean;
  danger?: boolean;
};
export type DialogState = {
  title: string;
  body: string;
  actions: DialogAction[];
  dismiss?: () => void;
};
export type ShellState = {
  filename: string | null;
  documentFormat: DocumentFormat | null;
  project: boolean;
  slideIndex: number;
  slideCount: number;
  editing: boolean;
  presenting: boolean;
  presentationControls: boolean;
  busy: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activeInput: boolean;
  settingsOpen: boolean;
  diagnostics: {
    filename: string | null;
    editable: number;
    total: number;
    parseMs: number;
    startupMs: number;
    engine: string;
  } | null;
  dialog: DialogState | null;
  notice: string | null;
};
let state: ShellState = {
  filename: null,
  documentFormat: null,
  project: false,
  slideIndex: 0,
  slideCount: 0,
  editing: false,
  presenting: false,
  presentationControls: true,
  busy: false,
  dirty: false,
  canUndo: false,
  canRedo: false,
  activeInput: false,
  settingsOpen: false,
  diagnostics: null,
  dialog: null,
  notice: null,
};
const subscribers = new Set<() => void>();
export const getUI = () => state;
export function subscribeUI(callback: () => void) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}
export function updateUI(next: Partial<ShellState>) {
  state = { ...state, ...next };
  subscribers.forEach((callback) => callback());
}
// Clear first so focus/close events cannot resolve an unsaved-change guard twice.
export function dismissDialog() {
  const dismiss = state.dialog?.dismiss;
  updateUI({ dialog: null });
  dismiss?.();
}
export function closeDialog() {
  updateUI({ dialog: null });
}
export function showDialog(
  title: string,
  body: string,
  actions: DialogAction[],
  dismiss?: () => void,
) {
  if (state.dialog) dismissDialog();
  updateUI({
    settingsOpen: false,
    dialog: { title, body, actions, dismiss },
  });
}
export type ShellActions = {
  open: () => void;
  previousSlide: () => void;
  nextSlide: () => void;
  sample: () => void;
  edit: () => void;
  preview: () => void;
  present: () => void;
  exitPresentation: () => void;
  undo: () => void;
  redo: () => void;
  exportFile: () => void;
  settings: () => void;
};
