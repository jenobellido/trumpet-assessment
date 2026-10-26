"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { combineAutosaveStatus } from "@/shared/hooks/combine-status";
import { useAutosave } from "@/shared/hooks/use-autosave";
import { cx } from "@/shared/lib/cx";
import { Button, TextInput } from "@/shared/ui";
import { isRetryableError } from "../api-client/widgets-api";
import { IMAGE_LIMITS, imageUrl } from "../domain/image";
import {
  WIDGET_LIMITS,
  type ImageWidget as ImageWidgetModel,
  type WidgetPatch,
} from "../domain/widget";
import type { SaveOptions } from "../hooks/use-widget-board";
import type { WidgetStore } from "../state/widget-store";
import styles from "./ImageWidget.module.css";
import { SaveIndicator } from "./SaveIndicator";
import { WidgetFrame, type WidgetControls } from "./WidgetFrame";

export type ImageWidgetProps = {
  store: WidgetStore;
  widget: ImageWidgetModel;
  onSave: (id: string, patch: WidgetPatch, options: SaveOptions) => Promise<void>;
  onUpload: (id: string, file: File) => Promise<string | null>;
  controls: WidgetControls;
};

/**
 * Image widget: upload by picking or dropping a file, then describe it.
 * Alt text and caption autosave independently, like text widgets.
 */
export function ImageWidget({ store, widget, onSave, onUpload, controls }: ImageWidgetProps) {
  const id = widget.id;
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const alt = useAutosave({
    initialValue: widget.alt,
    save: (value, options) => onSave(id, { alt: value }, options),
    shouldRetry: isRetryableError,
  });
  const caption = useAutosave({
    initialValue: widget.caption,
    save: (value, options) => onSave(id, { caption: value }, options),
    shouldRetry: isRetryableError,
  });

  async function upload(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError(await onUpload(id, file));
    setUploading(false);
  }

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    void upload(event.target.files?.[0]);
    event.target.value = ""; // allow choosing the same file again
  };

  const dropHandlers = {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      void upload(event.dataTransfer.files[0]);
    },
  };

  const removeImage = () => {
    store.update(id, { imageId: null });
    void onSave(id, { imageId: null }, { keepalive: false });
  };

  const status = combineAutosaveStatus(alt.status, caption.status);
  const update =
    (field: "alt" | "caption", autosave: typeof alt) => (event: ChangeEvent<HTMLInputElement>) => {
      store.update(id, { [field]: event.target.value });
      autosave.schedule(event.target.value);
    };

  return (
    <WidgetFrame
      label="Image"
      {...controls}
      footer={
        <SaveIndicator
          status={uploading ? "saving" : status}
          onRetry={() => {
            alt.retry();
            caption.retry();
          }}
        />
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_LIMITS.contentTypes.join(",")}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFileChosen}
      />

      {widget.imageId ? (
        <div className={styles.preview} {...dropHandlers} data-drag-over={dragOver || undefined}>
          {/* User uploads are served from our own API; next/image would need known dimensions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(widget.imageId)} alt={widget.alt} className={styles.image} />
          <div className={styles.imageActions}>
            <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? "Uploading…" : "Replace"}
            </Button>
            <Button size="sm" variant="danger" onClick={removeImage} disabled={uploading}>
              Remove image
            </Button>
          </div>
        </div>
      ) : (
        <div className={cx(styles.dropzone, dragOver && styles.dragOver)} {...dropHandlers}>
          <p className={styles.dropTitle}>{uploading ? "Uploading…" : "Drop an image here"}</p>
          <p className={styles.dropHint}>
            PNG, JPEG, GIF or WebP, up to {IMAGE_LIMITS.maxBytes / 1024 / 1024} MB
          </p>
          <Button
            size="sm"
            variant="primary"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            Choose image
          </Button>
        </div>
      )}

      {uploadError && (
        <p role="alert" className={styles.error}>
          {uploadError}
        </p>
      )}

      <div className={styles.fields}>
        <TextInput
          label="Alt text"
          hint="Describes the image for people using screen readers."
          value={widget.alt}
          maxLength={WIDGET_LIMITS.maxAltLength}
          onChange={update("alt", alt)}
          onBlur={alt.flush}
        />
        <TextInput
          label="Caption (optional)"
          value={widget.caption}
          maxLength={WIDGET_LIMITS.maxCaptionLength}
          onChange={update("caption", caption)}
          onBlur={caption.flush}
        />
      </div>
    </WidgetFrame>
  );
}
