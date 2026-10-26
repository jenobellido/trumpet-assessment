/**
 * Local safety net for unsaved text, kept in sessionStorage (per tab).
 *
 * On reload the browser requests the new page *before* the old page's exit
 * handlers run, so a final save can reach the server after the fresh HTML was
 * rendered. Writing a draft synchronously on exit and reconciling it on load
 * makes "refresh right after typing" lossless regardless of request order.
 *
 * Storage can be unavailable (private mode, quota), so every call is best effort.
 */

const key = (widgetId: string) => `widget-draft:${widgetId}`;

export function saveDraft(widgetId: string, content: string): void {
  try {
    sessionStorage.setItem(key(widgetId), content);
  } catch {
    // Best effort only.
  }
}

export function readDraft(widgetId: string): string | null {
  try {
    return sessionStorage.getItem(key(widgetId));
  } catch {
    return null;
  }
}

export function clearDraft(widgetId: string): void {
  try {
    sessionStorage.removeItem(key(widgetId));
  } catch {
    // Best effort only.
  }
}
