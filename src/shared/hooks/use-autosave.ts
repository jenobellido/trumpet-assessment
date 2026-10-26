"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSaveQueue, type SaveQueue, type SaveStatus } from "@/shared/lib/save-queue";

export type AutosaveStatus = SaveStatus | "unsaved";

export type SaveFn<T> = (value: T, options: { keepalive: boolean }) => Promise<void>;

export type UseAutosaveOptions<T> = {
  initialValue: T;
  save: SaveFn<T>;
  /** Idle time after the last change before saving ("done typing"). */
  delayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  /** Called synchronously when the page is closed with unsaved changes. */
  onUnsavedExit?: (value: T) => void;
};

/**
 * Debounced, crash-safe autosave for a single value.
 *
 * - `schedule(value)` on every change; the save fires after `delayMs` idle.
 * - `flush()` saves immediately (call it on blur).
 * - Pending edits are saved when the tab is hidden, sent with `keepalive`
 *   as early as possible when the page is closed (`beforeunload`, then
 *   `pagehide` as the fallback), and flushed on unmount.
 * - The browser warns before leaving only when a save has actually failed.
 */
export function useAutosave<T>({
  initialValue,
  save,
  delayMs = 800,
  shouldRetry,
  onUnsavedExit,
}: UseAutosaveOptions<T>) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [initial] = useState(initialValue);
  const optionsRef = useRef({ save, shouldRetry, onUnsavedExit });
  const valueRef = useRef(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueRef = useRef<SaveQueue<T> | null>(null);

  useEffect(() => {
    optionsRef.current = { save, shouldRetry, onUnsavedExit };
  });

  // Created on first use (never during render) and kept for the component's life.
  const getQueue = useCallback(() => {
    queueRef.current ??= createSaveQueue<T>({
      initialValue: initial,
      send: (value) => optionsRef.current.save(value, { keepalive: false }),
      onStatusChange: setStatus,
      shouldRetry: (error) => optionsRef.current.shouldRetry?.(error) ?? true,
    });
    return queueRef.current;
  }, [initial]);

  const schedule = useCallback(
    (value: T) => {
      const queue = getQueue();
      valueRef.current = value;
      clearTimeout(timerRef.current);
      if (!queue.isDirty(value)) {
        setStatus(queue.status); // edited back to the saved value
        return;
      }
      setStatus("unsaved");
      timerRef.current = setTimeout(() => queue.push(value), delayMs);
    },
    [getQueue, delayMs],
  );

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    getQueue().push(valueRef.current);
  }, [getQueue]);

  useEffect(() => {
    const queue = getQueue();
    let sentOnExit: { value: T } | null = null;
    const saveBeforeExit = () => {
      const value = valueRef.current;
      if (!queue.isDirty(value) || (sentOnExit && Object.is(sentOnExit.value, value))) return;
      sentOnExit = { value };
      clearTimeout(timerRef.current);
      optionsRef.current.onUnsavedExit?.(value);
      // keepalive lets the request outlive the page; it is idempotent, so a
      // duplicate of an in-flight save is harmless.
      optionsRef.current.save(value, { keepalive: true }).catch(() => {});
    };
    // Tab hidden but page alive: save through the queue so status stays accurate.
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      clearTimeout(timerRef.current);
      queue.push(valueRef.current);
    };
    // beforeunload runs before a reload's new request is sent, so the save
    // usually reaches the server first; pagehide covers browsers that skip it.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const failed = queue.status === "error";
      saveBeforeExit();
      if (failed) event.preventDefault(); // ask before leaving only if saving is failing
    };

    window.addEventListener("pagehide", saveBeforeExit);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", saveBeforeExit);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Unmounting (e.g. widget deleted) must not drop a debounced edit.
      clearTimeout(timerRef.current);
      queue.push(valueRef.current);
    };
  }, [getQueue]);

  return { status, schedule, flush, retry: flush };
}
