"use client";

import { useEffect, type ChangeEvent } from "react";
import { useAutosave, type SaveFn } from "@/shared/hooks/use-autosave";
import { TextArea } from "@/shared/ui";
import { isRetryableError } from "../api-client/widgets-api";
import { WIDGET_LIMITS, type TextWidget as TextWidgetModel } from "../domain/widget";
import type { SaveOptions } from "../hooks/use-widget-board";
import { clearDraft, readDraft, saveDraft } from "../state/drafts";
import type { WidgetStore } from "../state/widget-store";
import { SaveIndicator } from "./SaveIndicator";
import { WidgetFrame, type WidgetControls } from "./WidgetFrame";

export type TextWidgetProps = {
  store: WidgetStore;
  widget: TextWidgetModel;
  onSave: (id: string, patch: { content: string }, options: SaveOptions) => Promise<void>;
  controls: WidgetControls;
  autoFocus?: boolean;
};

/**
 * A single, independent text widget. It owns its own autosave lifecycle, so
 * widgets never share text, timers or save state.
 */
export function TextWidget({ store, widget, onSave, controls, autoFocus }: TextWidgetProps) {
  const widgetId = widget.id;
  const save: SaveFn<string> = (content, options) => onSave(widgetId, { content }, options);
  const { status, schedule, flush, retry } = useAutosave({
    initialValue: widget.content,
    save,
    shouldRetry: isRetryableError,
    onUnsavedExit: (content) => saveDraft(widgetId, content),
  });

  // Recover text that was typed right before the last page exit but had not
  // reached the server when this page was rendered, then save it again.
  useEffect(() => {
    const draft = readDraft(widgetId);
    if (draft === null) return;
    const current = store.getWidget(widgetId);
    if (current?.type === "text" && draft === current.content) {
      clearDraft(widgetId);
      return;
    }
    store.setContent(widgetId, draft);
    schedule(draft);
  }, [store, widgetId, schedule]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    store.setContent(widgetId, event.target.value);
    schedule(event.target.value);
  };

  return (
    <WidgetFrame
      label="Text"
      {...controls}
      footer={<SaveIndicator status={status} onRetry={retry} />}
    >
      <TextArea
        label="Widget text"
        hideLabel
        value={widget.content}
        onChange={handleChange}
        onBlur={flush}
        maxLength={WIDGET_LIMITS.maxContentLength}
        showCount
        placeholder="Start typing…"
        autoFocus={autoFocus}
      />
    </WidgetFrame>
  );
}
