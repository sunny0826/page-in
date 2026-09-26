export type DocumentFormat = 'report' | 'presentation';

export interface TextEntry {
  nodeId: string;
  startByte: number;
  endByte: number;
  raw: string;
  originalDecoded: string;
  domPath: number[];
  tag: string;
  textContext?: 'html' | 'pre-leading';
}
export interface OpenedDocument {
  sessionId: string;
  filename: string;
  source: string;
  resourceBase: string;
  project: boolean;
}
export interface SessionView {
  revision: number;
  texts: Record<string, string>;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
}
export interface ParsedDocument {
  format: DocumentFormat;
  live: boolean;
  html: string;
  entries: TextEntry[];
  warnings: string[];
}

export const emptySession = (): SessionView => ({ revision: 0, texts: {}, canUndo: false, canRedo: false, dirty: false });
export const maxSnapshotBytes = 16 * 1024 * 1024;
