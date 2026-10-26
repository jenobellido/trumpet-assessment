/** A promise you can settle from the outside, for controlling async timing in tests. */
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks run. */
export const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
