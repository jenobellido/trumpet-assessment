import type { ReactNode } from "react";
import { Button } from "../button/Button";
import styles from "./Toast.module.css";

export type ToastProps = {
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  tone?: "neutral" | "error";
};

export function Toast({ message, action, onDismiss, tone = "neutral" }: ToastProps) {
  return (
    <div className={styles.toast} data-tone={tone}>
      <span className={styles.message}>{message}</span>
      {action && (
        <Button size="sm" variant="ghost" className={styles.action} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={onDismiss}>
          ✕
        </Button>
      )}
    </div>
  );
}

/** Fixed, polite live region so screen readers announce new toasts. */
export function ToastRegion({ children }: { children: ReactNode }) {
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {children}
    </div>
  );
}
