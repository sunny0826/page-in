import { parseDocument } from './parser.ts';
self.onmessage = (event: MessageEvent<{ source: string; resourceBase: string }>) => {
  try { self.postMessage({ ok: true, result: parseDocument(event.data.source, event.data.resourceBase) }); }
  catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
};
