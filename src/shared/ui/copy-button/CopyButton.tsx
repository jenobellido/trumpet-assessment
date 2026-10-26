"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "../button/Button";

export type CopyButtonProps = Omit<ButtonProps, "onClick" | "children"> & {
  /** Text to copy. */
  value: string;
  /** Treat `value` as a path and copy it as an absolute URL on the current origin. */
  absoluteUrl?: boolean;
  label?: string;
};

/** Copies text to the clipboard and confirms with a short "Copied" state. */
export function CopyButton({
  value,
  absoluteUrl = false,
  label = "Copy",
  ...props
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2_000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        absoluteUrl ? new URL(value, window.location.origin).href : value,
      );
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <Button {...props} onClick={copy} aria-live="polite">
      {state === "copied" ? "Copied!" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}
