import { connection } from "next/server";
import { getContainer } from "@/server/container";

export async function GET(request: Request, ctx: RouteContext<"/api/pods/[podId]/widgets">) {
  await connection(); // always read fresh data, never prerender
  return getContainer().http.widgets.list(request, await ctx.params);
}
