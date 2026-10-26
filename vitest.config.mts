import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "@test": path.resolve(import.meta.dirname, "test"),
  // `server-only` throws outside a React Server environment; tests run in Node.
  "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/server/**/*.test.ts", "src/app/api/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/server/**", "src/app/api/**"],
          setupFiles: ["./test/setup-dom.ts"],
        },
      },
    ],
  },
});
