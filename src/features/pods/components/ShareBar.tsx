import { formatRelativeTime, pluralize } from "@/shared/lib/format";
import { CopyButton } from "@/shared/ui";
import { podShareUrl } from "../domain/api-contract";
import type { PodStats } from "../domain/pod";
import styles from "./ShareBar.module.css";

/** The buyer link for a pod, with engagement stats. Server-rendered (relative times). */
export function ShareBar({ shareId, stats }: { shareId: string; stats: PodStats }) {
  const path = podShareUrl(shareId);
  return (
    <div className={styles.bar}>
      <div className={styles.text}>
        <p className={styles.label}>Buyer link</p>
        <p className={styles.stats}>
          {pluralize(stats.viewCount, "view")}
          {stats.lastViewedAt && ` · last viewed ${formatRelativeTime(stats.lastViewedAt)}`}
        </p>
      </div>
      <div className={styles.actions}>
        <a href={path} target="_blank" rel="noreferrer" className={styles.open}>
          Open
        </a>
        <CopyButton size="sm" label="Copy link" value={path} absoluteUrl />
      </div>
    </div>
  );
}
