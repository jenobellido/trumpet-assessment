export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type SaveQueueOptions<T> = {
  /** Value already persisted on the server. Pushing it again is a no-op. */
  initialValue: T;
  send: (value: T) => Promise<void>;
  onStatusChange?: (status: SaveStatus) => void;
  /** Retries after the first failed attempt. */
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
  shouldRetry?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
};

export type SaveQueue<T> = ReturnType<typeof createSaveQueue<T>>;

/**
 * Serialises saves of a single value with "latest wins" semantics:
 *
 * - At most one request is in flight, so responses can never arrive out of
 *   order and overwrite newer text with older text.
 * - Values pushed while a request is in flight are coalesced: only the most
 *   recent one is sent next, so a burst of edits costs at most two requests.
 * - Failures retry with exponential backoff, but a newer value supersedes a
 *   pending retry instead of waiting behind it.
 */
export function createSaveQueue<T>({
  initialValue,
  send,
  onStatusChange,
  maxRetries = 3,
  retryDelayMs = (attempt) => 500 * 2 ** attempt,
  shouldRetry = () => true,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: SaveQueueOptions<T>) {
  let lastSaved = initialValue;
  let pending: { value: T } | null = null;
  let running = false;
  let failed = false;
  let status: SaveStatus = "idle";
  let idleWaiters: Array<() => void> = [];

  function setStatus(next: SaveStatus) {
    if (next === status) return;
    status = next;
    onStatusChange?.(next);
  }

  /** Resolves `true` once saved, `false` if it failed or was superseded. */
  async function sendWithRetry(value: T): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      try {
        await send(value);
        return true;
      } catch (error) {
        if (pending || attempt >= maxRetries || !shouldRetry(error)) return false;
        await sleep(retryDelayMs(attempt));
        if (pending) return false; // a newer value arrived during backoff
      }
    }
  }

  async function drain() {
    running = true;
    while (pending) {
      const { value } = pending;
      pending = null;
      setStatus("saving");
      if (await sendWithRetry(value)) {
        lastSaved = value;
        failed = false;
      } else if (!pending) {
        failed = true;
      }
    }
    running = false; // set synchronously after the last check: no lost pushes
    setStatus(failed ? "error" : "saved");
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  return {
    push(value: T) {
      if (!running && Object.is(value, lastSaved)) {
        if (failed) {
          failed = false;
          setStatus("saved");
        }
        return;
      }
      pending = { value };
      if (!running) void drain();
    },

    /** True when `value` is not yet known to be persisted. */
    isDirty(value: T): boolean {
      return running || pending !== null || !Object.is(value, lastSaved);
    },

    whenIdle(): Promise<void> {
      return running ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve();
    },

    get status() {
      return status;
    },

    get lastSaved() {
      return lastSaved;
    },
  };
}
