import { useId, type ComponentPropsWithRef } from "react";
import { cx } from "@/shared/lib/cx";
import styles from "./TextArea.module.css";

export type TextAreaProps = Omit<ComponentPropsWithRef<"textarea">, "value"> & {
  label: string;
  /** Keep the label for screen readers but hide it visually. */
  hideLabel?: boolean;
  value: string;
  /** Show a "used / max" counter. Requires `maxLength`. */
  showCount?: boolean;
};

/** Labelled, auto-growing textarea with an optional character counter. */
export function TextArea({
  label,
  hideLabel = false,
  value,
  showCount = false,
  maxLength,
  className,
  id,
  "aria-describedby": describedBy,
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const counterId = `${inputId}-count`;
  const withCount = showCount && maxLength !== undefined;
  const nearLimit = withCount && value.length >= maxLength * 0.9;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={hideLabel ? "visually-hidden" : styles.label}>
        {label}
      </label>
      <textarea
        id={inputId}
        className={styles.textarea}
        value={value}
        maxLength={maxLength}
        aria-describedby={cx(describedBy, withCount && counterId) || undefined}
        {...props}
      />
      {withCount && (
        <p id={counterId} className={cx(styles.counter, nearLimit && styles.nearLimit)}>
          {value.length.toLocaleString("en-US")} / {maxLength.toLocaleString("en-US")}{" "}
          <span className="visually-hidden">characters</span>
        </p>
      )}
    </div>
  );
}
