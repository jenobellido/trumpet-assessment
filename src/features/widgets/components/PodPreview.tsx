"use client";

import { useWidgetIds } from "../state/use-widget-store";
import type { WidgetStore } from "../state/widget-store";
import { PodContent } from "./PodContent";
import styles from "./PodPreview.module.css";

/** In-editor preview of the pod exactly as the buyer link renders it. */
export function PodPreview({ store }: { store: WidgetStore }) {
  useWidgetIds(store); // re-render if widgets are added, removed or moved
  return (
    <article className={styles.preview} aria-label="Pod content">
      <p className={styles.banner}>
        This is how a buyer sees your pod. Switch back to <strong>Edit</strong> to make changes.
      </p>
      <PodContent
        widgets={store.getWidgets()}
        emptyMessage="Nothing to show yet. Add some content in Edit mode."
      />
    </article>
  );
}
