"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSaveQueue, type SaveQueue } from "@/shared/lib/save-queue";
import {
  ApiError,
  createWidgetsApi,
  isRetryableError,
  type NewWidget,
  type WidgetsApi,
} from "../api-client/widgets-api";
import { IMAGE_LIMITS, type ImageContentType } from "../domain/image";
import { WIDGET_LIMITS, type Widget, type WidgetPatch, type WidgetType } from "../domain/widget";
import { clearDraft } from "../state/drafts";
import { createWidgetStore } from "../state/widget-store";

export const UNDO_WINDOW_MS = 5_000;

export type PendingDelete = { widget: Widget; timer: ReturnType<typeof setTimeout> };

export type SaveOptions = { keepalive: boolean };

export type UseWidgetBoardOptions = {
  podId: string;
  initialWidgets: readonly Widget[];
  /** Injectable for tests. */
  api?: WidgetsApi;
};

const isGone = (error: unknown) => error instanceof ApiError && error.status === 404;

function newWidgetFields(type: WidgetType, position: string): NewWidget {
  return type === "text"
    ? { type, position, content: "" }
    : { type, position, imageId: null, alt: "", caption: "" };
}

/** Client-side check mirroring the server's, for instant feedback. */
export function validateImageFile(file: File): string | null {
  if (!IMAGE_LIMITS.contentTypes.includes(file.type as ImageContentType)) {
    return "Choose a PNG, JPEG, GIF or WebP image";
  }
  if (file.size > IMAGE_LIMITS.maxBytes) {
    return `Images must be ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB or smaller`;
  }
  return null;
}

/**
 * Orchestrates the board: optimistic adds, ordered saves, reordering and
 * undoable deletes.
 *
 * - Add: the widget appears instantly with a client-generated id; the
 *   idempotent PUT runs in the background and is rolled back on failure.
 * - Save: waits for the widget's create request first, so the first edits
 *   to a brand-new widget can never race ahead of its creation.
 * - Reorder: only the moved widget gets a new order key; its saves go
 *   through their own latest-wins queue, so fast repeated moves send at most
 *   one request in flight per widget.
 * - Delete: removed from the UI immediately, committed to the server after
 *   an undo window (or straight away if the page is closed).
 */
export function useWidgetBoard({ podId, initialWidgets, api: injectedApi }: UseWidgetBoardOptions) {
  const [store] = useState(() => createWidgetStore(initialWidgets));
  const [api] = useState(() => injectedApi ?? createWidgetsApi(podId));
  const creations = useRef(new Map<string, Promise<unknown>>());
  const positionQueues = useRef(new Map<string, SaveQueue<string>>());
  const pendingDeletesRef = useRef(new Map<string, PendingDelete>());
  const [pendingDeletes, setPendingDeletes] = useState<PendingDelete[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const syncPendingDeletes = useCallback(() => {
    setPendingDeletes(Array.from(pendingDeletesRef.current.values()));
  }, []);

  const addWidget = useCallback(
    (type: WidgetType = "text") => {
      if (store.size >= WIDGET_LIMITS.maxWidgetsPerPod) return;
      const fields = newWidgetFields(type, store.nextPosition());
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      store.add({ ...fields, id, createdAt: now, updatedAt: now } as Widget);
      setLastAddedId(id);
      const creation = api.create(id, fields).catch((cause: unknown) => {
        store.remove(id);
        setError(cause instanceof ApiError ? cause.message : "Couldn't add the widget");
        throw cause;
      });
      creation.catch(() => {}); // handled above; avoid an unhandled rejection
      creations.current.set(id, creation);
    },
    [api, store],
  );

  const saveFields = useCallback(
    async (id: string, patch: WidgetPatch, { keepalive }: SaveOptions) => {
      await creations.current.get(id);
      try {
        await api.update(id, patch, { keepalive });
      } catch (cause) {
        // The widget was deleted (here or elsewhere): nothing left to save.
        if (!isGone(cause)) throw cause;
      }
      if ("content" in patch) clearDraft(id);
    },
    [api],
  );

  const moveWidget = useCallback(
    (id: string, toIndex: number) => {
      const previous = store.getWidget(id)?.position;
      const position = store.move(id, toIndex);
      if (!position || !previous) return;

      let queue = positionQueues.current.get(id);
      if (!queue) {
        queue = createSaveQueue<string>({
          initialValue: previous,
          send: (value) => saveFields(id, { position: value }, { keepalive: false }),
          shouldRetry: isRetryableError,
          onStatusChange: (status) => {
            if (status === "error") setError("Couldn't save the new order");
          },
        });
        positionQueues.current.set(id, queue);
      }
      queue.push(position);
    },
    [saveFields, store],
  );

  /** Uploads a file and attaches it to an image widget. Resolves to an error message, if any. */
  const uploadImage = useCallback(
    async (id: string, file: File): Promise<string | null> => {
      const invalid = validateImageFile(file);
      if (invalid) return invalid;
      try {
        const image = await api.uploadImage(file);
        store.update(id, { imageId: image.id });
        await saveFields(id, { imageId: image.id }, { keepalive: false });
        return null;
      } catch (cause) {
        return cause instanceof ApiError ? cause.message : "Couldn't upload the image";
      }
    },
    [api, saveFields, store],
  );

  const commitDelete = useCallback(
    async (id: string, { keepalive = false }: { keepalive?: boolean } = {}) => {
      const pending = pendingDeletesRef.current.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDeletesRef.current.delete(id);
      syncPendingDeletes();

      try {
        await creations.current.get(id)?.catch(() => {});
        await api.remove(id, { keepalive });
        creations.current.delete(id);
        positionQueues.current.delete(id);
        clearDraft(id);
      } catch {
        store.add(pending.widget); // keep the UI truthful
        setError("Couldn't delete the widget, it has been restored");
      }
    },
    [api, store, syncPendingDeletes],
  );

  const deleteWidget = useCallback(
    (id: string) => {
      const widget = store.remove(id);
      if (!widget) return;
      const timer = setTimeout(() => void commitDelete(id), UNDO_WINDOW_MS);
      pendingDeletesRef.current.set(id, { widget, timer });
      syncPendingDeletes();
    },
    [commitDelete, store, syncPendingDeletes],
  );

  const undoDelete = useCallback(
    (id: string) => {
      const pending = pendingDeletesRef.current.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDeletesRef.current.delete(id);
      store.add(pending.widget);
      syncPendingDeletes();
    },
    [store, syncPendingDeletes],
  );

  // Commit pending deletes if the page is closed or the board unmounts.
  useEffect(() => {
    const pendingDeletes = pendingDeletesRef.current;
    const commitAll = () => {
      for (const id of pendingDeletes.keys()) void commitDelete(id, { keepalive: true });
    };
    window.addEventListener("pagehide", commitAll);
    return () => {
      window.removeEventListener("pagehide", commitAll);
      commitAll();
    };
  }, [commitDelete]);

  return {
    store,
    addWidget,
    saveFields,
    moveWidget,
    uploadImage,
    deleteWidget,
    undoDelete,
    pendingDeletes,
    lastAddedId,
    error,
    dismissError: useCallback(() => setError(null), []),
    /** Stops treating the last added widget as new (no refocus on remount). */
    clearLastAdded: useCallback(() => setLastAddedId(null), []),
  };
}
