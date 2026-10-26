"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Widget } from "../domain/widget";
import type { WidgetStore } from "./widget-store";

export function useWidgetIds(store: WidgetStore): readonly string[] {
  return useSyncExternalStore(store.subscribeIds, store.getIds, store.getIds);
}

export function useWidget(store: WidgetStore, id: string): Widget | undefined {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeWidget(id, listener),
    [store, id],
  );
  const getSnapshot = useCallback(() => store.getWidget(id), [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
