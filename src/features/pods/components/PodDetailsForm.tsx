"use client";

import { useState, type ChangeEvent } from "react";
import { combineAutosaveStatus } from "@/shared/hooks/combine-status";
import { useAutosave, type AutosaveStatus } from "@/shared/hooks/use-autosave";
import { isRetryableError } from "@/shared/lib/api-error";
import { TextInput } from "@/shared/ui";
import { createPodsApi, type PodsApi } from "../api-client/pods-api";
import { POD_LIMITS, type Pod } from "../domain/pod";
import styles from "./PodDetailsForm.module.css";

const defaultApi = createPodsApi();

const STATUS_LABEL: Partial<Record<AutosaveStatus, string>> = {
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save, retrying when you edit again",
};

/**
 * Pod title and buyer name. Reuses the same `useAutosave` hook as widgets:
 * debounced saves, save on blur, and a keepalive save on page exit.
 */
export function PodDetailsForm({ pod, api = defaultApi }: { pod: Pod; api?: PodsApi }) {
  const [title, setTitle] = useState(pod.title);
  const [buyerName, setBuyerName] = useState(pod.buyerName);

  const titleSave = useAutosave({
    initialValue: pod.title,
    save: async (value, options) => void (await api.update(pod.id, { title: value }, options)),
    shouldRetry: isRetryableError,
  });
  const buyerSave = useAutosave({
    initialValue: pod.buyerName,
    save: async (value, options) => void (await api.update(pod.id, { buyerName: value }, options)),
    shouldRetry: isRetryableError,
  });

  const onChange =
    (set: (value: string) => void, autosave: typeof titleSave) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      set(event.target.value);
      autosave.schedule(event.target.value);
    };

  const status = combineAutosaveStatus(titleSave.status, buyerSave.status);

  return (
    <div className={styles.form}>
      <TextInput
        label="Pod title"
        hideLabel
        size="lg"
        placeholder="Untitled pod"
        value={title}
        maxLength={POD_LIMITS.maxTitleLength}
        onChange={onChange(setTitle, titleSave)}
        onBlur={titleSave.flush}
        className={styles.title}
      />
      <TextInput
        label="Prepared for (buyer or company)"
        placeholder="e.g. Acme Inc."
        value={buyerName}
        maxLength={POD_LIMITS.maxBuyerNameLength}
        onChange={onChange(setBuyerName, buyerSave)}
        onBlur={buyerSave.flush}
      />
      <p className={styles.status} role="status" aria-live="polite" data-status={status}>
        {STATUS_LABEL[status] ?? ""}
      </p>
    </div>
  );
}
