"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError } from "@/shared/lib/api-error";
import { Button, type ButtonProps } from "@/shared/ui";
import { createPodsApi } from "../api-client/pods-api";
import { podEditorUrl } from "../domain/api-contract";

const api = createPodsApi();

/** Creates an empty pod and opens it in the editor. */
export function NewPodButton({ children = "+ New pod", ...props }: Omit<ButtonProps, "onClick">) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });

  const create = async () => {
    setState({ busy: true, error: null });
    try {
      const pod = await api.create();
      router.push(podEditorUrl(pod.id));
    } catch (error) {
      setState({
        busy: false,
        error: error instanceof ApiError ? error.message : "Couldn't create the pod",
      });
    }
  };

  return (
    <>
      <Button variant="primary" {...props} onClick={create} disabled={state.busy}>
        {state.busy ? "Creating…" : children}
      </Button>
      {state.error && <span role="alert">{state.error}</span>}
    </>
  );
}
