import { getContainer } from "@/server/container";

export async function POST(request: Request, ctx: RouteContext<"/api/pods/[podId]/duplicate">) {
  return getContainer().http.pods.duplicate(request, await ctx.params);
}
