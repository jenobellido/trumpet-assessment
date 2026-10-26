// Public, client-safe API of the widgets feature.
// Server code lives in "@/features/widgets/server/*" and is wired up in "@/server/container".
export { PodContent } from "./components/PodContent";
export { WidgetBoard, type WidgetBoardProps } from "./components/WidgetBoard";
export { WidgetBoardSkeleton } from "./components/WidgetBoardSkeleton";
export { WIDGET_LIMITS, type Widget } from "./domain/widget";
