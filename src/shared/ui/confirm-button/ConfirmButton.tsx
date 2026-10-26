"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "../button/Button";

export type ConfirmButtonProps = Omit<ButtonProps, "onClick"> & {
  onConfirm: () => void;
  confirmLabel?: string;
  /** How long the confirm state stays armed. */
  timeoutMs?: number;
};

/**
 * Two-step destructive action: the first click arms it ("Confirm delete?"),
 * the second performs it. Lighter than a modal and impossible to trigger by
 * a single accidental click.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = "Click again to confirm",
  timeoutMs = 4_000,
  children,
  ...props
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), timeoutMs);
    return () => clearTimeout(timer);
  }, [armed, timeoutMs]);

  return (
    <Button
      variant="danger"
      {...props}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
