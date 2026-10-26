import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { getContainer } from "./container";

const REWRITE_HEADER = "x-middleware-rewrite";
const run = (path: string) => proxy(new NextRequest(`http://localhost${path}`));

describe("proxy (real 404s for unknown links)", () => {
  it("lets existing pods and buyer links through", async () => {
    const pod = await getContainer().pods.create({ title: "Acme", buyerName: "" });

    for (const path of [`/pods/${pod.id}`, `/share/${pod.shareId}`]) {
      expect((await run(path)).headers.get(REWRITE_HEADER)).toBeNull();
    }
  });

  it.each([
    ["an unknown pod", `/pods/${crypto.randomUUID()}`],
    ["an unknown buyer link", `/share/${crypto.randomUUID()}`],
    ["a malformed id", "/pods/not-a-uuid"],
  ])("rewrites %s to the not-found page", async (_label, path) => {
    expect((await run(path)).headers.get(REWRITE_HEADER)).toContain("/_not-found-pod");
  });
});
