import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "@test/deferred";
import { makeImageWidget, makeTextWidget } from "@test/widget-factories";
import { ApiError, type WidgetsApi } from "../api-client/widgets-api";
import { WIDGET_LIMITS, type Widget } from "../domain/widget";
import { UNDO_WINDOW_MS } from "../hooks/use-widget-board";
import { WidgetBoard } from "./WidgetBoard";

const POD = "11111111-1111-4111-8111-111111111111";
const IMAGE_ID = "33333333-3333-4333-8333-333333333333";

const makeWidget = (content = "") => makeTextWidget({ content });

function fakeApi(
  overrides: Partial<WidgetsApi> = {},
): WidgetsApi & Record<string, ReturnType<typeof vi.fn>> {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (id: string) => ({ ...makeWidget(), id })),
    update: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    uploadImage: vi.fn(async () => ({
      id: IMAGE_ID,
      url: `/api/images/${IMAGE_ID}`,
      contentType: "image/png" as const,
      size: 3,
    })),
    ...overrides,
  } as WidgetsApi & Record<string, ReturnType<typeof vi.fn>>;
}

const pngFile = () => new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });

describe("WidgetBoard", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  const renderBoard = (initialWidgets: Widget[] = [], api = fakeApi()) => {
    render(<WidgetBoard podId={POD} initialWidgets={initialWidgets} api={api} />);
    return api;
  };
  const textboxes = () => screen.queryAllByRole("textbox", { name: "Widget text" });
  const values = () => textboxes().map((box) => (box as HTMLTextAreaElement).value);
  const addText = () => user.click(screen.getByRole("button", { name: "+ Text" }));
  const addImage = () => user.click(screen.getByRole("button", { name: "+ Image" }));
  const settle = () => act(() => vi.advanceTimersByTimeAsync(1_000));
  const savedContent = (id: string, content: string) => [id, { content }, { keepalive: false }];

  describe("text widgets", () => {
    it("shows an empty state, then adds a widget that is focused and persisted", async () => {
      const api = renderBoard();
      expect(screen.getByText("No widgets yet")).toBeInTheDocument();

      await addText();

      expect(textboxes()).toHaveLength(1);
      expect(textboxes()[0]).toHaveFocus();
      expect(api.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: "text", content: "", position: expect.any(String) }),
      );
    });

    it("adds multiple widgets, each in a bordered card of its own", async () => {
      renderBoard();
      await addText();
      await addText();
      await addText();

      expect(screen.getAllByRole("article", { name: "Text widget" })).toHaveLength(3);
      expect(screen.getByText("3 / 50")).toBeInTheDocument();
    });

    it("keeps text independent between widgets and saves each to its own id", async () => {
      const [a, b] = [makeWidget(), makeWidget()];
      const api = renderBoard([a, b]);
      const [boxA, boxB] = textboxes();

      await user.type(boxA, "Alpha");
      await user.type(boxB, "Beta");
      await settle();

      expect(values()).toEqual(["Alpha", "Beta"]);
      expect(api.update).toHaveBeenCalledWith(...savedContent(a.id, "Alpha"));
      expect(api.update).toHaveBeenCalledWith(...savedContent(b.id, "Beta"));
    });

    it("saves once when the user stops typing, not on every keystroke", async () => {
      const widget = makeWidget();
      const api = renderBoard([widget]);

      await user.type(textboxes()[0], "Hello world");
      expect(api.update).not.toHaveBeenCalled();
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

      await settle();

      expect(api.update).toHaveBeenCalledTimes(1);
      expect(api.update).toHaveBeenCalledWith(...savedContent(widget.id, "Hello world"));
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    it("saves immediately on blur", async () => {
      const widget = makeWidget();
      const api = renderBoard([widget]);

      await user.type(textboxes()[0], "quick");
      await user.tab();

      expect(api.update).toHaveBeenCalledWith(...savedContent(widget.id, "quick"));
    });

    it("handles 1,000+ character content", async () => {
      const widget = makeWidget();
      const api = renderBoard([widget]);
      const large = "Lorem ipsum ".repeat(100); // 1,200 characters

      textboxes()[0].focus();
      await user.paste(large);
      await settle();

      expect(textboxes()[0]).toHaveValue(large);
      expect(api.update).toHaveBeenCalledWith(...savedContent(widget.id, large));
    });

    it("renders previously saved content (the state after a page refresh)", () => {
      renderBoard([makeWidget("First"), makeWidget("Second")]);
      expect(values()).toEqual(["First", "Second"]);
    });

    it("recovers a draft that had not reached the server before a refresh", async () => {
      const widget = makeWidget("stale server copy");
      sessionStorage.setItem(`widget-draft:${widget.id}`, "typed just before refresh");
      const api = renderBoard([widget]);

      expect(textboxes()[0]).toHaveValue("typed just before refresh");
      await settle();
      expect(api.update).toHaveBeenCalledWith(
        ...savedContent(widget.id, "typed just before refresh"),
      );
      expect(sessionStorage.getItem(`widget-draft:${widget.id}`)).toBeNull();
    });

    it("discards a draft the server already has", () => {
      const widget = makeWidget("already saved");
      sessionStorage.setItem(`widget-draft:${widget.id}`, "already saved");
      const api = renderBoard([widget]);

      expect(textboxes()[0]).toHaveValue("already saved");
      expect(api.update).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(`widget-draft:${widget.id}`)).toBeNull();
    });

    it("never sends an update for a new widget before its create request finishes", async () => {
      const creation = deferred<Widget>();
      const api = renderBoard([], fakeApi({ create: vi.fn(() => creation.promise) }));

      await addText();
      await user.type(textboxes()[0], "fast typist");
      await user.tab();
      expect(api.update).not.toHaveBeenCalled();

      await act(async () => creation.resolve(makeWidget()));
      await settle();
      expect(api.update).toHaveBeenCalledOnce();
    });

    it("rolls back an add that the server rejects and shows the error", async () => {
      const create = vi.fn(async () => {
        throw new ApiError(409, "WIDGET_LIMIT_REACHED", "A pod can hold at most 50 widgets");
      });
      renderBoard([], fakeApi({ create }));

      await addText();
      await settle();

      expect(textboxes()).toHaveLength(0);
      expect(screen.getByText("A pod can hold at most 50 widgets")).toBeInTheDocument();
    });

    it("shows a retry action when saving fails permanently", async () => {
      const update = vi
        .fn<WidgetsApi["update"]>()
        .mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "bad"))
        .mockResolvedValue();
      const api = renderBoard([makeWidget()], fakeApi({ update }));

      await user.type(textboxes()[0], "x");
      await user.tab();
      await settle();
      expect(screen.getByText("Couldn't save")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Retry" }));
      await settle();
      expect(api.update).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  describe("image widgets", () => {
    const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

    it("adds an image widget, uploads a file and attaches it", async () => {
      const api = renderBoard();
      await addImage();
      const card = screen.getByRole("article", { name: "Image widget" });
      expect(within(card).getByText("Drop an image here")).toBeInTheDocument();

      await user.upload(fileInput(), pngFile());
      await settle();

      expect(api.uploadImage).toHaveBeenCalledWith(expect.any(File));
      const [[widgetId]] = (api.create as ReturnType<typeof vi.fn>).mock.calls;
      expect(api.update).toHaveBeenCalledWith(
        widgetId,
        { imageId: IMAGE_ID },
        { keepalive: false },
      );
      // Empty alt text makes it decorative (no "img" role) until the seller describes it.
      expect(card.querySelector("img")).toHaveAttribute("src", `/api/images/${IMAGE_ID}`);
    });

    it("accepts a file dropped onto the widget", async () => {
      const api = renderBoard([makeImageWidget()]);
      const dropzone = screen.getByText("Drop an image here").parentElement!;

      fireEvent.drop(dropzone, { dataTransfer: { files: [pngFile()], types: ["Files"] } });
      await settle();

      expect(api.uploadImage).toHaveBeenCalled();
    });

    it("rejects unsupported files before uploading", async () => {
      const api = renderBoard([makeImageWidget()]);
      const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });

      // Bypass the input's `accept` filter, as a drag-and-drop or older browser could.
      fireEvent.change(fileInput(), { target: { files: [svg] } });
      await settle();

      expect(api.uploadImage).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(/PNG, JPEG, GIF or WebP/);
    });

    it("shows the server's error when an upload fails", async () => {
      const uploadImage = vi.fn(async () => {
        throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Images must be 2 MB or smaller");
      });
      renderBoard([makeImageWidget()], fakeApi({ uploadImage }));

      await user.upload(fileInput(), pngFile());
      await settle();

      expect(screen.getByRole("alert")).toHaveTextContent("Images must be 2 MB or smaller");
    });

    it("autosaves alt text and caption independently", async () => {
      const widget = makeImageWidget({ imageId: IMAGE_ID });
      const api = renderBoard([widget]);

      await user.type(screen.getByRole("textbox", { name: "Alt text" }), "Our team");
      await user.type(screen.getByRole("textbox", { name: "Caption (optional)" }), "Kick-off");
      await settle();

      expect(api.update).toHaveBeenCalledWith(widget.id, { alt: "Our team" }, { keepalive: false });
      expect(api.update).toHaveBeenCalledWith(
        widget.id,
        { caption: "Kick-off" },
        { keepalive: false },
      );
      expect(screen.getByRole("img", { name: "Our team" })).toBeInTheDocument();
    });

    it("removes the image from the widget", async () => {
      const widget = makeImageWidget({ imageId: IMAGE_ID });
      const api = renderBoard([widget]);

      await user.click(screen.getByRole("button", { name: "Remove image" }));

      expect(api.update).toHaveBeenCalledWith(widget.id, { imageId: null }, { keepalive: false });
      expect(screen.getByText("Drop an image here")).toBeInTheDocument();
    });
  });

  describe("reordering", () => {
    it("moves widgets with the move buttons and saves only the moved widget's position", async () => {
      const [a, b, c] = [makeWidget("A"), makeWidget("B"), makeWidget("C")];
      const api = renderBoard([a, b, c]);

      const thirdCard = screen.getAllByRole("article")[2];
      await user.click(within(thirdCard).getByRole("button", { name: "Move widget up" }));
      await settle();

      expect(values()).toEqual(["A", "C", "B"]);
      expect(api.update).toHaveBeenCalledTimes(1);
      expect(api.update).toHaveBeenCalledWith(
        c.id,
        { position: expect.any(String) },
        { keepalive: false },
      );
      const [[, { position }]] = (api.update as ReturnType<typeof vi.fn>).mock.calls;
      expect(position > a.position && position < b.position).toBe(true);
    });

    it("disables moving past the ends and keeps focus on the move control", async () => {
      renderBoard([makeWidget("A"), makeWidget("B")]);
      const [first, second] = screen.getAllByRole("article");
      expect(within(first).getByRole("button", { name: "Move widget up" })).toBeDisabled();
      expect(within(second).getByRole("button", { name: "Move widget down" })).toBeDisabled();

      await user.click(within(first).getByRole("button", { name: "Move widget down" }));
      await act(() => vi.advanceTimersByTimeAsync(50));

      expect(values()).toEqual(["B", "A"]);
      expect(document.activeElement).toHaveAccessibleName(/Move widget/);
      expect(screen.getByText(/Widget moved to position 2 of 2/)).toBeInTheDocument();
    });

    it("exposes a keyboard-accessible drag handle on every widget", () => {
      renderBoard([makeWidget("A"), makeImageWidget()]);
      expect(
        screen.getByRole("button", { name: "Drag to reorder text widget" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Drag to reorder image widget" })).toHaveAttribute(
        "aria-roledescription",
        "sortable",
      );
    });

    it("coalesces rapid moves of one widget into a single in-flight save", async () => {
      const first = deferred<void>();
      const update = vi
        .fn<WidgetsApi["update"]>()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue();
      const widgets = [makeWidget("A"), makeWidget("B"), makeWidget("C")];
      const api = renderBoard(widgets, fakeApi({ update }));

      const moveUp = () =>
        user.click(
          within(
            screen.getAllByRole("article").find((card) => within(card).queryByDisplayValue("C"))!,
          ).getByRole("button", { name: "Move widget up" }),
        );
      await moveUp(); // C → middle (in flight)
      await moveUp(); // C → top (queued)
      expect(api.update).toHaveBeenCalledTimes(1);

      await act(async () => first.resolve());
      await settle();
      expect(api.update).toHaveBeenCalledTimes(2);
      expect(values()).toEqual(["C", "A", "B"]);
    });
  });

  describe("deleting", () => {
    it("deletes with undo: nothing is sent to the server if the user undoes", async () => {
      const widget = makeWidget("Important");
      const api = renderBoard([widget]);

      await user.click(screen.getByRole("button", { name: "Delete widget" }));
      expect(textboxes()).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: "Undo" }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

      expect(textboxes()[0]).toHaveValue("Important");
      expect(api.remove).not.toHaveBeenCalled();
    });

    it("commits the delete to the server after the undo window", async () => {
      const [keep, drop] = [makeWidget("keep"), makeWidget("drop")];
      const api = renderBoard([keep, drop]);

      const dropCard = screen.getAllByRole("article")[1];
      await user.click(within(dropCard).getByRole("button", { name: "Delete widget" }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

      expect(api.remove).toHaveBeenCalledWith(drop.id, { keepalive: false });
      expect(values()).toEqual(["keep"]);
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    });

    it("restores a widget when the delete request fails", async () => {
      const widget = makeWidget("survivor");
      renderBoard(
        [widget],
        fakeApi({ remove: vi.fn(async () => Promise.reject(new Error("down"))) }),
      );

      await user.click(screen.getByRole("button", { name: "Delete widget" }));
      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 100));

      expect(textboxes()[0]).toHaveValue("survivor");
      expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument();
    });
  });

  it("disables adding once the pod is full", () => {
    const full = Array.from({ length: WIDGET_LIMITS.maxWidgetsPerPod }, () => makeWidget());
    renderBoard(full);
    expect(screen.getByRole("button", { name: "+ Text" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Image" })).toBeDisabled();
    expect(screen.getByText(/reached its limit/i)).toBeInTheDocument();
  });

  describe("buyer preview", () => {
    const preview = () => user.click(screen.getByRole("button", { name: "Preview as buyer" }));
    const edit = () => user.click(screen.getByRole("button", { name: "Edit" }));

    it("shows text and images read-only, without controls, skipping empty widgets", async () => {
      renderBoard([
        makeWidget("Welcome to the pod"),
        makeWidget("   "),
        makeImageWidget({ imageId: IMAGE_ID, alt: "Product shot", caption: "Our product" }),
        makeImageWidget(), // no image yet
      ]);

      await preview();

      expect(textboxes()).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Delete widget" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "+ Text" })).not.toBeInTheDocument();
      const content = screen.getByLabelText("Pod content");
      expect(within(content).getByText("Welcome to the pod")).toBeInTheDocument();
      expect(within(content).getAllByRole("img")).toHaveLength(1);
      expect(within(content).getByRole("img", { name: "Product shot" })).toBeInTheDocument();
      expect(within(content).getByText("Our product")).toBeInTheDocument();
    });

    it("shows a placeholder when there is nothing to show", async () => {
      renderBoard([makeWidget("")]);
      await preview();
      expect(screen.getByText(/nothing to show yet/i)).toBeInTheDocument();
    });

    it("saves unsaved text when switching to preview and keeps it on return", async () => {
      const widget = makeWidget();
      const api = renderBoard([widget]);

      await user.type(textboxes()[0], "draft");
      await preview();
      expect(screen.getByText("draft")).toBeInTheDocument();
      await settle();
      expect(api.update).toHaveBeenCalledWith(...savedContent(widget.id, "draft"));

      await edit();
      expect(textboxes()[0]).toHaveValue("draft");
      expect(textboxes()[0]).not.toHaveFocus();
    });
  });
});
