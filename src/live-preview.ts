import { maxSnapshotBytes } from './contracts.ts';
import { t } from './i18n.ts';

export interface LiveSnapshot { html: string; x: number; y: number }

export function createLivePreview(frame: HTMLIFrameElement, options: {
  escape: () => void; pointer: () => void;
}) {
  let channel: string | null = null;
  let ready: { resolve: () => void; reject: (error: Error) => void } | null = null;
  let pending: { id: string; resolve: (snapshot: LiveSnapshot) => void; reject: (error: Error) => void } | null = null;
  let timer = 0;
  let readyTimer = 0;
  const fail = () => new Error(t('liveCaptureFailed'));
  window.addEventListener('message', event => {
    if (!channel || event.source !== frame.contentWindow || event.origin !== 'null'
      || event.data?.channel !== channel) return;
    const data = event.data;
    if (data.type === 'ready') { clearTimeout(readyTimer); ready?.resolve(); ready = null; }
    if (data.type === 'escape') options.escape();
    if (data.type === 'pointer') options.pointer();
    if (!pending || data.id !== pending.id) return;
    if (data.type !== 'snapshot' && data.type !== 'capture-error') return;
    const request = pending; pending = null; clearTimeout(timer);
    if (data.type !== 'snapshot' || typeof data.html !== 'string'
      || data.html.length > maxSnapshotBytes || new TextEncoder().encode(data.html).length > maxSnapshotBytes
      || !Number.isFinite(data.x) || !Number.isFinite(data.y)) { request.reject(fail()); return; }
    request.resolve({ html: data.html, x: Math.max(0, Math.min(data.x, 1e7)), y: Math.max(0, Math.min(data.y, 1e7)) });
  });
  function stop() {
    channel = null; clearTimeout(timer); clearTimeout(readyTimer);
    ready?.reject(fail()); ready = null;
    pending?.reject(fail()); pending = null;
    frame.hidden = true; frame.src = 'about:blank';
  }
  return {
    get active() { return channel !== null; },
    stop,
    async load(url: string, nextChannel: string) {
      stop(); channel = nextChannel;
      frame.hidden = false;
      await new Promise<void>((resolve, reject) => {
        ready = { resolve, reject };
        readyTimer = window.setTimeout(() => { ready = null; reject(new Error(t('renderTimeout'))); }, 15000);
        frame.src = url;
      }).catch(error => { stop(); throw error; });
    },
    capture(): Promise<LiveSnapshot> {
      if (!channel || pending) return Promise.reject(fail());
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pending = { id, resolve, reject };
        timer = window.setTimeout(() => { pending = null; reject(fail()); }, 10000);
        frame.contentWindow?.postMessage({ channel, id, type: 'capture' }, '*');
      });
    },
  };
}
