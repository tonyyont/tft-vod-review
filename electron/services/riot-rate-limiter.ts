function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createRiotRateLimiter(params?: {
  minIntervalMs?: number;
  windowMs?: number;
  windowMax?: number;
}) {
  // Riot rate limiting (personal key friendly)
  const minIntervalMs = params?.minIntervalMs ?? 250; // 4 req/sec conservative
  const windowMs = params?.windowMs ?? 120_000;
  const windowMax = params?.windowMax ?? 90; // conservative under 100/2min

  let lastRequestAt = 0;
  let recentRequests: number[] = []; // timestamps (ms) within rolling windowMs
  // IMPORTANT: this must be concurrency-safe. Multiple callers can call `withRiotRateLimit`
  // at the same time, so we serialize all slots through a single promise chain.
  let queue: Promise<void> = Promise.resolve();

  async function waitForSlot(): Promise<void> {
    // Min interval
    const now = Date.now();
    const waitForInterval = lastRequestAt + minIntervalMs - now;
    if (waitForInterval > 0) await sleep(waitForInterval);

    // Rolling window
    const now2 = Date.now();
    recentRequests = recentRequests.filter((t) => now2 - t < windowMs);
    if (recentRequests.length >= windowMax) {
      const oldest = recentRequests[0];
      const waitMs = oldest + windowMs - now2 + 50;
      if (waitMs > 0) await sleep(waitMs);
    }

    const now3 = Date.now();
    lastRequestAt = now3;
    recentRequests.push(now3);
  }

  async function withRiotRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      await waitForSlot();
      return fn();
    };

    // Serialize runs; also ensure the queue keeps flowing even if one run rejects.
    const resultPromise = queue.then(run, run);
    queue = resultPromise.then(
      () => undefined,
      () => undefined,
    );
    return resultPromise;
  }

  return { withRiotRateLimit };
}

