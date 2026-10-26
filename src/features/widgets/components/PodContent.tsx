import { imageUrl } from "../domain/image";
import { isWidgetEmpty, type Widget } from "../domain/widget";
import styles from "./PodContent.module.css";

/**
 * Read-only rendering of a pod's widgets, as a buyer sees them. Pure and
 * hook-free, so it renders on the server for buyer links and on the client
 * for the in-editor preview. Empty widgets are left out.
 */
export function PodContent({
  widgets,
  emptyMessage = "Nothing to show yet.",
}: {
  widgets: readonly Widget[];
  emptyMessage?: string;
}) {
  const visible = widgets.filter((widget) => !isWidgetEmpty(widget));
  if (visible.length === 0) return <p className={styles.empty}>{emptyMessage}</p>;

  return (
    <div className={styles.content}>
      {visible.map((widget) =>
        widget.type === "text" ? (
          <section key={widget.id} className={styles.text}>
            {widget.content}
          </section>
        ) : (
          <figure key={widget.id} className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served from our own API */}
            <img
              src={imageUrl(widget.imageId!)}
              alt={widget.alt}
              className={styles.image}
              loading="lazy"
              decoding="async"
            />
            {widget.caption && <figcaption className={styles.caption}>{widget.caption}</figcaption>}
          </figure>
        ),
      )}
    </div>
  );
}
