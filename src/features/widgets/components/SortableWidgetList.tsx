"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useId, useMemo } from "react";
import { cx } from "@/shared/lib/cx";
import type { WidgetPatch } from "../domain/widget";
import type { SaveOptions } from "../hooks/use-widget-board";
import { useWidget } from "../state/use-widget-store";
import type { WidgetStore } from "../state/widget-store";
import { ImageWidget } from "./ImageWidget";
import { TextWidget } from "./TextWidget";
import styles from "./WidgetBoard.module.css";

export type WidgetActions = {
  onSave: (id: string, patch: WidgetPatch, options: SaveOptions) => Promise<void>;
  onUpload: (id: string, file: File) => Promise<string | null>;
  onMove: (id: string, toIndex: number) => void;
  onDelete: (id: string) => void;
};

type Props = WidgetActions & {
  store: WidgetStore;
  ids: readonly string[];
  lastAddedId: string | null;
};

/**
 * Drag-and-drop list of widgets. Pointer drags use a handle (so text stays
 * selectable), keyboard users pick up the handle with Space and move with the
 * arrow keys, and every move is announced to screen readers.
 */
export function SortableWidgetList({ store, ids, lastAddedId, ...actions }: Props) {
  const dndId = useId(); // deterministic ids avoid hydration mismatches
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements = useMemo<Announcements>(() => {
    const position = (id: string | number) => `${ids.indexOf(String(id)) + 1} of ${ids.length}`;
    return {
      onDragStart: ({ active }) => `Picked up widget at position ${position(active.id)}.`,
      onDragOver: ({ over }) =>
        over ? `Widget is over position ${position(over.id)}.` : undefined,
      onDragEnd: ({ over }) =>
        over ? `Widget dropped at position ${position(over.id)}.` : undefined,
      onDragCancel: () => "Reordering cancelled.",
    };
  }, [ids]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      actions.onMove(String(active.id), ids.indexOf(String(over.id)));
    }
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To reorder, press Space to pick up the widget, use the arrow keys to move it, then press Space to drop it or Escape to cancel.",
        },
      }}
    >
      <SortableContext items={ids as string[]} strategy={verticalListSortingStrategy}>
        <ul className={styles.list}>
          {ids.map((id, index) => (
            <SortableWidget
              key={id}
              store={store}
              id={id}
              index={index}
              count={ids.length}
              autoFocus={id === lastAddedId}
              {...actions}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

type SortableWidgetProps = WidgetActions & {
  store: WidgetStore;
  id: string;
  index: number;
  count: number;
  autoFocus: boolean;
};

/** Subscribes to its own widget only: editing one widget re-renders just this item. */
const SortableWidget = memo(function SortableWidget({
  store,
  id,
  index,
  count,
  autoFocus,
  onSave,
  onUpload,
  onMove,
  onDelete,
}: SortableWidgetProps) {
  const widget = useWidget(store, id);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  if (!widget) return null;

  const controls = {
    dragHandle: { ref: setActivatorNodeRef, ...attributes, ...listeners },
    canMoveUp: index > 0,
    canMoveDown: index < count - 1,
    onMoveUp: () => onMove(id, index - 1),
    onMoveDown: () => onMove(id, index + 1),
    onDelete: () => onDelete(id),
  };

  return (
    <li
      ref={setNodeRef}
      data-widget-id={id}
      className={cx(styles.item, autoFocus && styles.entering, isDragging && styles.dragging)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {widget.type === "text" ? (
        <TextWidget
          store={store}
          widget={widget}
          onSave={onSave}
          controls={controls}
          autoFocus={autoFocus}
        />
      ) : (
        <ImageWidget
          store={store}
          widget={widget}
          onSave={onSave}
          onUpload={onUpload}
          controls={controls}
        />
      )}
    </li>
  );
});
