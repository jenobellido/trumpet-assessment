import { getContainer } from "@/server/container";

export async function POST(request: Request, ctx: RouteContext<"/api/share/[shareId]/views">) {
  return getContainer().http.pods.recordView(request, await ctx.params);
}
