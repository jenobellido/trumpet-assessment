import type { ComponentPropsWithRef } from "react";
import { cx } from "@/shared/lib/cx";
import styles from "./Button.module.css";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

/** Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[size], className)}
      {...props}
    />
  );
}
