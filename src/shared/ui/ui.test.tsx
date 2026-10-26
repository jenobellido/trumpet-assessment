import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Card,
  ConfirmButton,
  CopyButton,
  EmptyState,
  SegmentedControl,
  TextArea,
  TextInput,
  Toast,
} from ".";

describe("Button", () => {
  it("renders a non-submitting button by default and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Add</Button>);

    const button = screen.getByRole("button", { name: "Add" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Add
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("TextArea", () => {
  function Controlled(props: { maxLength?: number; initial?: string }) {
    const [value, setValue] = useState(props.initial ?? "");
    return (
      <TextArea
        label="Notes"
        value={value}
        maxLength={props.maxLength}
        showCount
        onChange={(e) => setValue(e.target.value)}
      />
    );
  }

  it("is accessible by its label, even when the label is visually hidden", () => {
    render(<TextArea label="Widget text" hideLabel value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Widget text" })).toBeInTheDocument();
  });

  it("shows a live character counter linked via aria-describedby", async () => {
    render(<Controlled maxLength={100} />);
    const textbox = screen.getByRole("textbox", { name: "Notes" });

    await userEvent.type(textbox, "hello");

    expect(screen.getByText(/5 \/ 100/)).toBeInTheDocument();
    expect(textbox).toHaveAccessibleDescription("5 / 100 characters");
  });

  it("handles large strings (1,000+ characters)", async () => {
    const large = "x".repeat(1_000);
    render(<Controlled maxLength={10_000} />);
    const textbox = screen.getByRole("textbox", { name: "Notes" });

    textbox.focus();
    await userEvent.paste(large);

    expect(textbox).toHaveValue(large);
    expect(screen.getByText(/1,000 \/ 10,000/)).toBeInTheDocument();
  });

  it("does not render a counter without maxLength", () => {
    render(<TextArea label="Notes" value="abc" showCount onChange={() => {}} />);
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders title, actions, body and footer", () => {
    render(
      <Card title="Text widget" actions={<button>Delete</button>} footer="Saved">
        Body
      </Card>,
    );
    expect(screen.getByRole("article")).toHaveTextContent("Body");
    expect(screen.getByRole("heading", { name: "Text widget" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("omits the header when there is no title or actions", () => {
    render(<Card>Only body</Card>);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});

describe("Toast", () => {
  it("renders an action and a dismiss button", async () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(
      <Toast
        message="Widget deleted"
        action={{ label: "Undo", onClick: onUndo }}
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(<EmptyState title="No widgets" description="Add one" action={<button>Add</button>} />);
    expect(screen.getByText("No widgets")).toBeInTheDocument();
    expect(screen.getByText("Add one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("marks the selected option as pressed and reports changes", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="View mode"
        options={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
        ]}
        value="edit"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("group", { name: "View mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onChange).toHaveBeenCalledWith("preview");
  });
});

describe("TextInput", () => {
  it("is labelled and links its hint for screen readers", () => {
    render(<TextInput label="Alt text" hint="Describes the image" value="" onChange={() => {}} />);
    const input = screen.getByRole("textbox", { name: "Alt text" });
    expect(input).toHaveAccessibleDescription("Describes the image");
  });
});

describe("CopyButton", () => {
  it("copies an absolute URL built from a path and confirms", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

    render(<CopyButton value="/share/abc" absoluteUrl label="Copy link" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/share/abc`);
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("reports a failure when the clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<CopyButton value="x" />);
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe("ConfirmButton", () => {
  it("needs a second click to confirm", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton onConfirm={onConfirm} confirmLabel="Delete forever?">
        Delete
      </ConfirmButton>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete forever?" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("disarms after the timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onConfirm = vi.fn();
    render(
      <ConfirmButton onConfirm={onConfirm} timeoutMs={1_000}>
        Delete
      </ConfirmButton>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await act(() => vi.advanceTimersByTimeAsync(1_100));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
