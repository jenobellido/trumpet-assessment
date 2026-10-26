import { getContainer } from "@/server/container";

type Ctx = RouteContext<"/api/pods/[podId]/widgets/[widgetId]">;

export async function PUT(request: Request, ctx: Ctx) {
  return getContainer().http.widgets.create(request, await ctx.params);
}

export async function PATCH(request: Request, ctx: Ctx) {
  return getContainer().http.widgets.update(request, await ctx.params);
}

export async function DELETE(request: Request, ctx: Ctx) {
  return getContainer().http.widgets.remove(request, await ctx.params);
}
