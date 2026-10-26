import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Text Widgets · Pod",
  description: "Add independent text widgets to a pod. Everything is saved automatically.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
