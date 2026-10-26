import type { AutosaveStatus } from "@/shared/hooks/use-autosave";
import { Button } from "@/shared/ui";
import styles from "./SaveIndicator.module.css";

const LABELS: Record<AutosaveStatus, string> = {
  idle: "",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save",
};

export type SaveIndicatorProps = { status: AutosaveStatus; onRetry: () => void };

export function SaveIndicator({ status, onRetry }: SaveIndicatorProps) {
  return (
    <div className={styles.indicator} data-status={status}>
      <span role="status" aria-live="polite" className={styles.label}>
        {LABELS[status]}
      </span>
      {status === "error" && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
