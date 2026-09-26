export const MAX_INPUT_BYTES = 1024 * 1024;

export function validateInputText(text: string): void {
  if (text.includes('\0') || new TextEncoder().encode(text).length > MAX_INPUT_BYTES) {
    throw new Error('文字过长或含不支持字符');
  }
}

type Phase = 'editing' | 'committing' | 'finished';
interface TransactionOptions {
  before: string;
  commit: (text: string) => Promise<void>;
  idle: () => Promise<void>;
  pending: () => void;
  complete: (text: string) => void;
  recover: () => void;
}

// Own the draft until Rust acknowledges it. In particular, a rejected commit
// must not turn a later finish into a successful no-op at a navigation boundary.
export function createInputTransaction(options: TransactionOptions) {
  let phase: Phase = 'editing';
  let draft = options.before;
  let inFlight: Promise<void> | null = null;
  return {
    get phase() { return phase; },
    get draft() { return draft; },
    setDraft(text: string) {
      if (phase !== 'editing') return false;
      draft = text;
      return true;
    },
    finish(cancel = false): Promise<void> {
      if (inFlight) return inFlight;
      if (phase === 'finished') return options.idle();
      const text = cancel ? options.before : draft;
      if (cancel || text === options.before) {
        phase = 'finished';
        options.complete(text);
        return options.idle();
      }
      try { validateInputText(text); }
      catch (error) { options.recover(); return Promise.reject(error); }
      phase = 'committing';
      // Install the shared promise before freezing contenteditable, which can
      // itself dispatch blur and call finish again in a system WebView.
      inFlight = Promise.resolve().then(() => options.commit(text)).then(() => {
        phase = 'finished';
        options.complete(text);
      }, error => {
        phase = 'editing';
        options.recover();
        throw error;
      }).finally(() => { inFlight = null; });
      options.pending();
      return inFlight;
    },
  };
}
