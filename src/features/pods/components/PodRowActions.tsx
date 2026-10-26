"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ApiError } from "@/shared/lib/api-error";
import { Button, ConfirmButton, CopyButton } from "@/shared/ui";
import { createPodsApi, type PodsApi } from "../api-client/pods-api";
import { podEditorUrl, podShareUrl } from "../domain/api-contract";
import styles from "./PodList.module.css";

const defaultApi = createPodsApi();

/** Dashboard row actions. After a change the server-rendered list is refreshed. */
export function PodRowActions({
  podId,
  shareId,
  api = defaultApi,
}: {
  podId: string;
  shareId: string;
  api?: PodsApi;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>, fallback: string) =>
    startTransition(async () => {
      setError(null);
      try {
        await action();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : fallback);
      }
    });

  return (
    <div className={styles.actions}>
      <CopyButton
        size="sm"
        variant="ghost"
        label="Copy buyer link"
        value={podShareUrl(shareId)}
        absoluteUrl
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const copy = await api.duplicate(podId);
            router.push(podEditorUrl(copy.id));
          }, "Couldn't duplicate the pod")
        }
      >
        Duplicate
      </Button>
      <ConfirmButton
        size="sm"
        disabled={pending}
        confirmLabel="Delete forever?"
        onConfirm={() => run(() => api.remove(podId), "Couldn't delete the pod")}
      >
        Delete
      </ConfirmButton>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}
