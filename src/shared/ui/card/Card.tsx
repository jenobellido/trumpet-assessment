import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import styles from "./Card.module.css";

export type CardProps = Omit<ComponentPropsWithRef<"article">, "title"> & {
  title?: ReactNode;
  /** Rendered before the title, outside the heading (e.g. a drag handle). */
  leading?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
};

/** Bordered container with optional header (leading, title, actions) and footer. */
export function Card({
  title,
  leading,
  actions,
  footer,
  children,
  className,
  ...props
}: CardProps) {
  const hasHeader = title !== undefined || actions !== undefined || leading !== undefined;
  return (
    <article className={cx(styles.card, className)} {...props}>
      {hasHeader && (
        <header className={styles.header}>
          <div className={styles.lead}>
            {leading}
            {title !== undefined && <h2 className={styles.title}>{title}</h2>}
          </div>
          {actions !== undefined && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
      {footer !== undefined && <footer className={styles.footer}>{footer}</footer>}
    </article>
  );
}
