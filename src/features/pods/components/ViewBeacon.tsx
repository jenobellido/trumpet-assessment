"use client";

import { useEffect } from "react";
import { shareViewPath } from "../domain/api-contract";

// One count per page load, even if React mounts the effect twice (Strict Mode).
const counted = new Set<string>();

/**
 * Records a buyer view once the page has actually loaded in a browser.
 * Counting here rather than during server rendering means link-preview bots
 * (which don't run JavaScript) and repeated renders never inflate the count.
 */
export function ViewBeacon({ shareId }: { shareId: string }) {
  useEffect(() => {
    if (counted.has(shareId)) return;
    counted.add(shareId);
    const url = shareViewPath(shareId);
    if (!navigator.sendBeacon?.(url)) {
      void fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    }
  }, [shareId]);
  return null;
}
