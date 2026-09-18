export type FullscreenHost = {
  isFullscreen: () => Promise<boolean>;
  setFullscreen: (value: boolean) => Promise<void>;
};

type ScheduleCheck = (check: () => void) => () => void;
const scheduleCheck: ScheduleCheck = check => {
  const timer = setTimeout(check, 300);
  return () => clearTimeout(timer);
};

// Entry waits for native confirmation. Exit always gives the user the shell back.
export function createSlideshow(
  host: FullscreenHost,
  changed: (active: boolean) => void,
  schedule: ScheduleCheck = scheduleCheck,
) {
  let active = false;
  let previousFullscreen = false;
  let queue = Promise.resolve();
  let cancelCheck: (() => void) | undefined;
  let generation = 0;
  const run = (operation: () => Promise<void>) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  function restoreShell() {
    active = false;
    generation++;
    cancelCheck?.();
    cancelCheck = undefined;
    changed(false);
  }
  const sync = () => run(async () => {
    if (active && !await host.isFullscreen()) restoreShell();
  });
  function monitor(expected = generation) {
    if (!active || expected !== generation) return;
    cancelCheck = schedule(() => {
      if (expected !== generation) return;
      cancelCheck = undefined;
      // macOS can emit its last resize before isFullscreen changes. Keep checking
      // while presenting, even if no further resize/focus event arrives.
      void sync().catch(() => {}).finally(() => monitor(expected));
    });
  }
  return {
    enter: () => run(async () => {
      if (active) return;
      previousFullscreen = await host.isFullscreen();
      if (!previousFullscreen) await host.setFullscreen(true);
      active = true;
      generation++;
      changed(true);
      monitor();
    }),
    exit: () => run(async () => {
      if (!active) return;
      // Native exit may animate, reject, or time out. None should strand users
      // behind a hidden toolbar (especially once the controls have auto-hidden).
      restoreShell();
      if (await host.isFullscreen() !== previousFullscreen) {
        await host.setFullscreen(previousFullscreen);
      }
    }),
    sync,
  };
}
