import { describe, expect, it, vi } from "vitest";
import { deferred } from "@test/deferred";
import { createSaveQueue, type SaveStatus } from "./save-queue";

function setup(overrides: Partial<Parameters<typeof createSaveQueue<string>>[0]> = {}) {
  const calls: Array<{ value: string; settle: ReturnType<typeof deferred<void>> }> = [];
  const statuses: SaveStatus[] = [];
  const send = vi.fn((value: string) => {
    const settle = deferred();
    calls.push({ value, settle });
    return settle.promise;
  });
  const queue = createSaveQueue({
    initialValue: "",
    send,
    onStatusChange: (status) => statuses.push(status),
    sleep: () => Promise.resolve(),
    ...overrides,
  });
  return { queue, send, calls, statuses };
}

describe("createSaveQueue", () => {
  it("sends a pushed value and reports saving → saved", async () => {
    const { queue, calls, statuses } = setup();

    queue.push("hello");
    expect(calls.map((c) => c.value)).toEqual(["hello"]);
    expect(queue.status).toBe("saving");

    calls[0].settle.resolve();
    await queue.whenIdle();

    expect(statuses).toEqual(["saving", "saved"]);
    expect(queue.lastSaved).toBe("hello");
    expect(queue.isDirty("hello")).toBe(false);
  });

  it("keeps at most one request in flight and coalesces to the latest value", async () => {
    const { queue, calls } = setup();

    queue.push("a");
    queue.push("ab");
    queue.push("abc");
    expect(calls.map((c) => c.value)).toEqual(["a"]);

    calls[0].settle.resolve();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].value).toBe("abc"); // "ab" was skipped entirely

    calls[1].settle.resolve();
    await queue.whenIdle();
    expect(queue.lastSaved).toBe("abc");
  });

  it("never lets an older save overwrite a newer one", async () => {
    // Because requests are serialised, "new" is only sent after "old" settles,
    // so the server always ends up with the latest value.
    const serverWrites: string[] = [];
    const { queue, calls } = setup();

    queue.push("old");
    queue.push("new");
    calls[0].settle.resolve();
    serverWrites.push(calls[0].value);
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    calls[1].settle.resolve();
    serverWrites.push(calls[1].value);
    await queue.whenIdle();

    expect(serverWrites.at(-1)).toBe("new");
  });

  it("skips pushing a value that is already saved", () => {
    const { queue, send } = setup({ initialValue: "same" });
    queue.push("same");
    expect(send).not.toHaveBeenCalled();
    expect(queue.status).toBe("idle");
  });

  it("retries with backoff and succeeds", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const send = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("503"))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce();
    const queue = createSaveQueue({ initialValue: "", send, sleep });

    queue.push("x");
    await queue.whenIdle();

    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
    expect(queue.status).toBe("saved");
  });

  it("reports error after exhausting retries and recovers on the next push", async () => {
    const send = vi.fn<(value: string) => Promise<void>>().mockRejectedValue(new Error("down"));
    const queue = createSaveQueue({ initialValue: "", send, maxRetries: 2, sleep: async () => {} });

    queue.push("x");
    await queue.whenIdle();
    expect(send).toHaveBeenCalledTimes(3);
    expect(queue.status).toBe("error");
    expect(queue.isDirty("x")).toBe(true);

    send.mockResolvedValue();
    queue.push("x");
    await queue.whenIdle();
    expect(queue.status).toBe("saved");
  });

  it("does not retry errors the caller marks as permanent", async () => {
    const send = vi.fn<(value: string) => Promise<void>>().mockRejectedValue(new Error("400"));
    const queue = createSaveQueue({
      initialValue: "",
      send,
      shouldRetry: () => false,
      sleep: async () => {},
    });

    queue.push("x");
    await queue.whenIdle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.status).toBe("error");
  });

  it("abandons a pending retry when a newer value arrives", async () => {
    const backoff = deferred();
    const send = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("flaky"))
      .mockResolvedValue();
    const queue = createSaveQueue({ initialValue: "", send, sleep: () => backoff.promise });

    queue.push("old");
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    queue.push("new"); // arrives while waiting to retry "old"
    backoff.resolve();
    await queue.whenIdle();

    expect(send.mock.calls.map(([value]) => value)).toEqual(["old", "new"]);
    expect(queue.lastSaved).toBe("new");
    expect(queue.status).toBe("saved");
  });

  it("clears an error when the value is edited back to the saved one", async () => {
    const send = vi.fn<(value: string) => Promise<void>>().mockRejectedValue(new Error("down"));
    const queue = createSaveQueue({ initialValue: "", send, maxRetries: 0 });

    queue.push("typo");
    await queue.whenIdle();
    expect(queue.status).toBe("error");

    queue.push("");
    expect(queue.status).toBe("saved");
    expect(queue.isDirty("")).toBe(false);
  });
});
