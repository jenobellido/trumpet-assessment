import {
  positionBetween,
  type ImageWidget,
  type TextWidget,
} from "@/features/widgets/domain/widget";

let lastPosition: string | null = null;

/** Increasing fractional keys, so widgets made in sequence keep that order. */
function nextPosition(): string {
  lastPosition = positionBetween(lastPosition, null);
  return lastPosition;
}

export function makeTextWidget(overrides: Partial<TextWidget> = {}): TextWidget {
  return {
    id: crypto.randomUUID(),
    type: "text",
    content: "",
    position: nextPosition(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeImageWidget(overrides: Partial<ImageWidget> = {}): ImageWidget {
  return {
    id: crypto.randomUUID(),
    type: "image",
    imageId: null,
    alt: "",
    caption: "",
    position: nextPosition(),
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
