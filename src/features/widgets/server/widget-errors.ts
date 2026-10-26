export class WidgetNotFoundError extends Error {
  constructor(readonly widgetId: string) {
    super(`Widget ${widgetId} was not found`);
    this.name = "WidgetNotFoundError";
  }
}

export class WidgetLimitReachedError extends Error {
  constructor(readonly limit: number) {
    super(`A pod can hold at most ${limit} widgets`);
    this.name = "WidgetLimitReachedError";
  }
}

/** The pod a widget or image belongs to does not exist. */
export class ParentPodNotFoundError extends Error {
  constructor(readonly podId: string) {
    super(`Pod ${podId} was not found`);
    this.name = "ParentPodNotFoundError";
  }
}

export class WidgetValidationError extends Error {
  constructor(readonly issues: Array<{ path: PropertyKey[]; message: string }>) {
    super("Invalid widget update");
    this.name = "WidgetValidationError";
  }
}

export class InvalidImageError extends Error {
  constructor(
    message: string,
    readonly reason: "too_large" | "unsupported_type" | "missing",
  ) {
    super(message);
    this.name = "InvalidImageError";
  }
}
