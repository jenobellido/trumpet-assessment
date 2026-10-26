import type { HTMLAttributes, ReactNode, Ref } from "react";
import { Button, Card } from "@/shared/ui";
import styles from "./WidgetFrame.module.css";

export type DragHandleProps = HTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

export type WidgetControls = {
  dragHandle?: DragHandleProps;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

export type WidgetFrameProps = WidgetControls & {
  label: string;
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for every widget type: a bordered card with a drag handle,
 * keyboard-friendly move buttons and delete. Widget types only supply their
 * body and footer, so new types get reordering and deletion for free.
 */
export function WidgetFrame({
  label,
  dragHandle,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  footer,
  children,
}: WidgetFrameProps) {
  return (
    <Card
      aria-label={`${label} widget`}
      title={label}
      leading={
        dragHandle && (
          <button
            type="button"
            className={styles.handle}
            aria-label={`Drag to reorder ${label.toLowerCase()} widget`}
            {...dragHandle}
          >
            <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
              {[3, 8, 13].map((y) =>
                [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />),
              )}
            </svg>
          </button>
        )
      }
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Move widget up"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Move widget down"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            ↓
          </Button>
          <Button size="sm" variant="danger" aria-label="Delete widget" onClick={onDelete}>
            Delete
          </Button>
        </>
      }
      footer={footer}
    >
      {children}
    </Card>
  );
}
