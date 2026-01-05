import fs from 'fs';
import path from 'path';

export function createVodWatcher(params: {
  onRescan: (folderPath: string) => Promise<void>;
  pollIntervalMs?: number;
  debounceMs?: number;
}) {
  const pollIntervalMs = params.pollIntervalMs ?? 15_000;
  const debounceMs = params.debounceMs ?? 1000;

  let watcher: fs.FSWatcher | null = null;
  let watchPath: string | null = null;
  let rescanTimer: NodeJS.Timeout | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let rescanInFlight = false;
  let rescanQueued = false;

  function stop() {
    if (watcher) {
      try {
        watcher.close();
      } catch {
        // ignore
      }
      watcher = null;
    }
    watchPath = null;
    if (rescanTimer) {
      clearTimeout(rescanTimer);
      rescanTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    rescanInFlight = false;
    rescanQueued = false;
  }

  async function rescanAndMaybeQueue(): Promise<void> {
    if (!watchPath) return;
    if (rescanInFlight) {
      rescanQueued = true;
      return;
    }
    rescanInFlight = true;
    try {
      await params.onRescan(watchPath);
    } finally {
      rescanInFlight = false;
      if (rescanQueued) {
        rescanQueued = false;
        scheduleRescan(250);
      }
    }
  }

  function scheduleRescan(delayMs: number = debounceMs) {
    if (!watchPath) return;
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      void rescanAndMaybeQueue();
    }, delayMs);
  }

  function start(folderPath: string) {
    stop();
    if (!folderPath) return;
    const resolved = path.resolve(folderPath);
    if (!fs.existsSync(resolved)) {
      console.warn('VOD folder does not exist:', resolved);
      return;
    }
    watchPath = resolved;

    try {
      watcher = fs.watch(resolved, { recursive: true }, () => {
        // Debounce rapid events from OBS writes/renames
        scheduleRescan(debounceMs);
      });
    } catch (error) {
      console.error('Failed to watch VOD folder:', error);
      watcher = null;
    }

    // Fallback poll in case fs.watch misses events on some filesystems
    pollTimer = setInterval(() => scheduleRescan(0), pollIntervalMs);

    // Ensure initial sync on startup / folder change
    scheduleRescan(0);
  }

  return { start, stop };
}

