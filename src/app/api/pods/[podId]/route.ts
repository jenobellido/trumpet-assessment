import { connection } from "next/server";
import { getContainer } from "@/server/container";

type Ctx = RouteContext<"/api/pods/[podId]">;

export async function GET(request: Request, ctx: Ctx) {
  await connection();
  return getContainer().http.pods.get(request, await ctx.params);
}

export async function PATCH(request: Request, ctx: Ctx) {
  return getContainer().http.pods.update(request, await ctx.params);
}

export async function DELETE(request: Request, ctx: Ctx) {
  return getContainer().http.pods.remove(request, await ctx.params);
}
