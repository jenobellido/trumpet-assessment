import { getContainer } from "@/server/container";

export async function POST(request: Request, ctx: RouteContext<"/api/pods/[podId]/images">) {
  return getContainer().http.widgets.uploadImage(request, await ctx.params);
}
