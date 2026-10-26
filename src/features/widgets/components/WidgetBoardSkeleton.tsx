import styles from "./WidgetBoard.module.css";

export function WidgetBoardSkeleton() {
  return (
    <div className={styles.board} aria-busy="true" aria-label="Loading widgets">
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
    </div>
  );
}
