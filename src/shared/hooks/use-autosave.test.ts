import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave, type SaveFn } from "./use-autosave";

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(save: SaveFn<string> = vi.fn(async () => {})) {
    const hook = renderHook(() => useAutosave({ initialValue: "", save, delayMs: 800 }));
    return { ...hook, save };
  }

  it("debounces: saves once, 800ms after the last change", async () => {
    const { result, save } = setup();

    act(() => {
      result.current.schedule("h");
      vi.advanceTimersByTime(500);
      result.current.schedule("he");
      vi.advanceTimersByTime(500);
      result.current.schedule("hey");
    });
    expect(result.current.status).toBe("unsaved");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("hey", { keepalive: false });
    expect(result.current.status).toBe("saved");
  });

  it("flush() saves immediately without waiting for the debounce", async () => {
    const { result, save } = setup();

    await act(async () => {
      result.current.schedule("typed then blurred");
      result.current.flush();
    });

    expect(save).toHaveBeenCalledWith("typed then blurred", { keepalive: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(save).toHaveBeenCalledTimes(1); // the debounced save was cancelled
  });

  it("does not save when the text is edited back to the saved value", async () => {
    const { result, save } = setup();

    act(() => {
      result.current.schedule("x");
      result.current.schedule("");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("sends unsaved changes with keepalive when the page is hidden", () => {
    const { result, save } = setup();

    act(() => result.current.schedule("about to close the tab"));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(save).toHaveBeenCalledWith("about to close the tab", { keepalive: true });
  });

  it("saves early on beforeunload, records a draft, and does not resend on pagehide", () => {
    const save = vi.fn(async () => {});
    const onUnsavedExit = vi.fn();
    const { result } = renderHook(() => useAutosave({ initialValue: "", save, onUnsavedExit }));

    act(() => result.current.schedule("refresh right after typing"));
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(onUnsavedExit).toHaveBeenCalledExactlyOnceWith("refresh right after typing");
    expect(save).toHaveBeenCalledExactlyOnceWith("refresh right after typing", { keepalive: true });
  });

  it("does nothing on page hide when everything is saved", () => {
    const { save } = setup();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("flushes a pending edit on unmount", () => {
    const { result, save, unmount } = setup();

    act(() => result.current.schedule("deleted mid-typing"));
    unmount();

    expect(save).toHaveBeenCalledWith("deleted mid-typing", { keepalive: false });
  });

  it("exposes error status and lets the user retry", async () => {
    const save = vi.fn<SaveFn<string>>().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() =>
      useAutosave({ initialValue: "", save, shouldRetry: () => false }),
    );

    await act(async () => {
      result.current.schedule("x");
      result.current.flush();
    });
    expect(result.current.status).toBe("error");

    save.mockResolvedValue();
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.status).toBe("saved");
  });
});
