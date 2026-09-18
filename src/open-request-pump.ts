// Notifications are hints; native state remains authoritative, including at startup.
export function createOpenRequestPump(options: {
  blocked: () => boolean;
  pending: () => Promise<string | null>;
  open: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  error: (error: unknown) => void;
}) {
  let running = false;
  let notified = false;
  async function drain() {
    if (running || options.blocked()) return;
    running = true;
    try {
      do {
        notified = false;
        const id = await options.pending();
        if (!id || options.blocked()) break;
        try {
          await options.open(id);
        } catch (error) {
          options.error(error);
        }
        await options.dismiss(id);
        notified = true;
      } while (!options.blocked());
    } catch (error) {
      options.error(error);
      // Error notifications may update UI and call wake synchronously. Do not spin.
      notified = false;
    } finally {
      running = false;
      if (notified && !options.blocked()) void drain();
    }
  }
  return {
    wake() {
      notified = true;
      void drain();
    },
  };
}
