import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PodsApi } from "../api-client/pods-api";
import type { Pod, PodSummary } from "../domain/pod";
import { PodDetailsForm } from "./PodDetailsForm";
import { PodList } from "./PodList";
import { PodRowActions } from "./PodRowActions";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NOW = new Date("2026-03-10T12:00:00.000Z");

function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: crypto.randomUUID(),
    shareId: crypto.randomUUID(),
    title: "Acme renewal",
    buyerName: "Acme Inc.",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-10T11:55:00.000Z",
    ...overrides,
  };
}

function fakeApi(overrides: Partial<PodsApi> = {}) {
  return {
    create: vi.fn(async () => makePod()),
    update: vi.fn(async (podId: string) => makePod({ id: podId })),
    duplicate: vi.fn(async () => makePod({ id: "copy-id" })),
    remove: vi.fn(async () => {}),
    ...overrides,
  } satisfies PodsApi;
}

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

describe("PodList", () => {
  it("lists pods with buyer, widget count, views and last edit", () => {
    const pods: PodSummary[] = [
      {
        ...makePod({ title: "Acme renewal" }),
        widgetCount: 3,
        viewCount: 2,
        lastViewedAt: "2026-03-10T10:00:00.000Z",
      },
      {
        ...makePod({ title: "", buyerName: "" }),
        widgetCount: 1,
        viewCount: 0,
        lastViewedAt: null,
      },
    ];
    render(<PodList pods={pods} now={NOW} />);

    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByRole("link", { name: "Acme renewal" })).toHaveAttribute(
      "href",
      `/pods/${pods[0].id}`,
    );
    expect(first).toHaveTextContent("For Acme Inc.");
    expect(first).toHaveTextContent("3 widgets");
    expect(first).toHaveTextContent("2 buyer views, last 2 hours ago");
    expect(first).toHaveTextContent("Edited 5 minutes ago");
    expect(within(second).getByRole("link", { name: "Untitled pod" })).toBeInTheDocument();
    expect(second).toHaveTextContent("No buyer set");
    expect(second).toHaveTextContent("1 widget");
  });

  it("shows an empty state that invites creating the first pod", () => {
    render(<PodList pods={[]} now={NOW} />);
    expect(screen.getByText("No pods yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first pod" })).toBeInTheDocument();
  });
});

describe("PodRowActions", () => {
  it("duplicates a pod and opens the copy", async () => {
    const api = fakeApi();
    render(<PodRowActions podId="pod-1" shareId="share-1" api={api} />);

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(api.duplicate).toHaveBeenCalledWith("pod-1");
    expect(router.push).toHaveBeenCalledWith("/pods/copy-id");
  });

  it("deletes only after confirmation, then refreshes the list", async () => {
    const api = fakeApi();
    render(<PodRowActions podId="pod-1" shareId="share-1" api={api} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete forever?" }));

    expect(api.remove).toHaveBeenCalledWith("pod-1");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows an error when an action fails", async () => {
    const api = fakeApi({ duplicate: vi.fn().mockRejectedValue(new Error("down")) });
    render(<PodRowActions podId="pod-1" shareId="share-1" api={api} />);

    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't duplicate the pod");
  });
});

describe("PodDetailsForm", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("autosaves title and buyer name as separate field updates", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const api = fakeApi();
    const pod = makePod({ title: "", buyerName: "" });
    render(<PodDetailsForm pod={pod} api={api} />);

    await user.type(screen.getByRole("textbox", { name: "Pod title" }), "Q4 proposal");
    await user.type(
      screen.getByRole("textbox", { name: "Prepared for (buyer or company)" }),
      "Globex",
    );
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(api.update).toHaveBeenCalledWith(pod.id, { title: "Q4 proposal" }, { keepalive: false });
    expect(api.update).toHaveBeenCalledWith(pod.id, { buyerName: "Globex" }, { keepalive: false });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
