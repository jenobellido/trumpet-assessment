import { connection } from "next/server";
import { getContainer } from "@/server/container";

export async function GET(request: Request, ctx: RouteContext<"/api/images/[imageId]">) {
  await connection();
  return getContainer().http.widgets.getImage(request, await ctx.params);
}
