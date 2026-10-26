"use client";

import { useCallback, useState } from "react";
import { Button, EmptyState, SegmentedControl, Toast, ToastRegion } from "@/shared/ui";
import type { WidgetsApi } from "../api-client/widgets-api";
import { WIDGET_LIMITS, type Widget } from "../domain/widget";
import { useWidgetBoard } from "../hooks/use-widget-board";
import { useWidgetIds } from "../state/use-widget-store";
import { PodPreview } from "./PodPreview";
import { SortableWidgetList } from "./SortableWidgetList";
import styles from "./WidgetBoard.module.css";

type BoardMode = "edit" | "preview";

const MODES = [
  { value: "edit", label: "Edit" },
  { value: "preview", label: "Preview as buyer" },
] as const;

export type WidgetBoardProps = {
  podId: string;
  initialWidgets: readonly Widget[];
  api?: WidgetsApi;
};

export function WidgetBoard({ podId, initialWidgets, api }: WidgetBoardProps) {
  const board = useWidgetBoard({ podId, initialWidgets, api });
  const ids = useWidgetIds(board.store);
  const [mode, setMode] = useState<BoardMode>("edit");
  const [announcement, setAnnouncement] = useState("");
  const isFull = ids.length >= WIDGET_LIMITS.maxWidgetsPerPod;
  const { moveWidget } = board;

  const changeMode = (next: BoardMode) => {
    board.clearLastAdded();
    setMode(next);
  };

  /** Moves a widget and keeps keyboard focus on the control that moved it. */
  const onMove = useCallback(
    (id: string, toIndex: number) => {
      const focusedLabel = document.activeElement?.getAttribute("aria-label");
      moveWidget(id, toIndex);
      const count = board.store.size;
      setAnnouncement(`Widget moved to position ${Math.min(toIndex, count - 1) + 1} of ${count}.`);
      if (focusedLabel?.startsWith("Move widget")) {
        requestAnimationFrame(() => {
          const item = document.querySelector(`[data-widget-id="${id}"]`);
          const target =
            item?.querySelector<HTMLElement>(`[aria-label="${focusedLabel}"]:not(:disabled)`) ??
            item?.querySelector<HTMLElement>('[aria-label^="Move widget"]:not(:disabled)');
          target?.focus();
        });
      }
    },
    [board.store, moveWidget],
  );

  const addButtons = (
    <div className={styles.addButtons}>
      <Button variant="primary" onClick={() => board.addWidget("text")} disabled={isFull}>
        + Text
      </Button>
      <Button variant="primary" onClick={() => board.addWidget("image")} disabled={isFull}>
        + Image
      </Button>
    </div>
  );

  return (
    <section className={styles.board} aria-labelledby="widgets-heading">
      <div className={styles.toolbar}>
        <h2 id="widgets-heading" className={styles.heading}>
          {mode === "preview" ? (
            "Buyer preview"
          ) : (
            <>
              Widgets{" "}
              <span className={styles.count}>
                {ids.length} / {WIDGET_LIMITS.maxWidgetsPerPod}
              </span>
            </>
          )}
        </h2>
        <div className={styles.toolbarActions}>
          <SegmentedControl label="View mode" options={MODES} value={mode} onChange={changeMode} />
          {mode === "edit" && ids.length > 0 && addButtons}
        </div>
      </div>

      {mode === "preview" ? (
        <PodPreview store={board.store} />
      ) : (
        <>
          {isFull && (
            <p className={styles.hint}>
              This pod has reached its limit of {WIDGET_LIMITS.maxWidgetsPerPod} widgets.
            </p>
          )}

          {ids.length === 0 ? (
            <EmptyState
              title="No widgets yet"
              description="Add text or an image to start building this pod. Everything is saved automatically."
              action={addButtons}
            />
          ) : (
            <SortableWidgetList
              store={board.store}
              ids={ids}
              lastAddedId={board.lastAddedId}
              onSave={board.saveFields}
              onUpload={board.uploadImage}
              onMove={onMove}
              onDelete={board.deleteWidget}
            />
          )}
        </>
      )}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>

      <ToastRegion>
        {board.pendingDeletes.map(({ widget }) => (
          <Toast
            key={widget.id}
            message="Widget deleted"
            action={{ label: "Undo", onClick: () => board.undoDelete(widget.id) }}
          />
        ))}
        {board.error && <Toast tone="error" message={board.error} onDismiss={board.dismissError} />}
      </ToastRegion>
    </section>
  );
}
