import { useId, type ComponentPropsWithRef } from "react";
import { cx } from "@/shared/lib/cx";
import styles from "./TextInput.module.css";

export type TextInputProps = Omit<ComponentPropsWithRef<"input">, "value" | "size"> & {
  label: string;
  hideLabel?: boolean;
  value: string;
  hint?: string;
  size?: "md" | "lg";
};

/** Labelled single-line input with an optional hint linked for screen readers. */
export function TextInput({
  label,
  hideLabel = false,
  hint,
  size = "md",
  className,
  id,
  "aria-describedby": describedBy,
  ...props
}: TextInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={hideLabel ? "visually-hidden" : styles.label}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        className={cx(styles.input, styles[size])}
        aria-describedby={cx(describedBy, hint && hintId) || undefined}
        {...props}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
