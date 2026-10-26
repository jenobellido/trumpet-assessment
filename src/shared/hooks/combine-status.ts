import type { AutosaveStatus } from "./use-autosave";

const PRIORITY: AutosaveStatus[] = ["error", "saving", "unsaved", "saved", "idle"];

/** Overall status of several autosaved fields: the most urgent one wins. */
export function combineAutosaveStatus(...statuses: AutosaveStatus[]): AutosaveStatus {
  return PRIORITY.find((status) => statuses.includes(status)) ?? "idle";
}
