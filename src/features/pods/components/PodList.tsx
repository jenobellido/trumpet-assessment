import Link from "next/link";
import { formatRelativeTime, pluralize } from "@/shared/lib/format";
import { EmptyState } from "@/shared/ui";
import { podEditorUrl } from "../domain/api-contract";
import { podDisplayTitle, type PodSummary } from "../domain/pod";
import { NewPodButton } from "./NewPodButton";
import styles from "./PodList.module.css";
import { PodRowActions } from "./PodRowActions";

/** Server-rendered inventory of pods, most recently edited first. */
export function PodList({ pods, now = new Date() }: { pods: readonly PodSummary[]; now?: Date }) {
  if (pods.length === 0) {
    return (
      <EmptyState
        title="No pods yet"
        description="Create a pod for each buyer: add text and images, then share one link with them."
        action={<NewPodButton>Create your first pod</NewPodButton>}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {pods.map((pod) => (
        <li key={pod.id} className={styles.row}>
          <div className={styles.main}>
            <Link href={podEditorUrl(pod.id)} className={styles.title}>
              {podDisplayTitle(pod)}
            </Link>
            <p className={styles.meta}>
              {pod.buyerName ? <span>For {pod.buyerName}</span> : <span>No buyer set</span>}
              <span aria-hidden="true">·</span>
              <span>{pluralize(pod.widgetCount, "widget")}</span>
              <span aria-hidden="true">·</span>
              <span>
                {pluralize(pod.viewCount, "buyer view")}
                {pod.lastViewedAt && `, last ${formatRelativeTime(pod.lastViewedAt, now)}`}
              </span>
              <span aria-hidden="true">·</span>
              <span>Edited {formatRelativeTime(pod.updatedAt, now)}</span>
            </p>
          </div>
          <PodRowActions podId={pod.id} shareId={pod.shareId} />
        </li>
      ))}
    </ul>
  );
}
