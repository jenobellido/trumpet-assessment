import { NextResponse, type NextRequest } from "next/server";
import { podIdSchema, shareIdSchema } from "@/features/pods/domain/pod";
import { getContainer } from "@/server/container";

/**
 * Returns a real 404 for unknown pod and buyer links.
 *
 * Pages stream their shell immediately, which fixes the status at 200 before
 * the pod lookup inside the page can run. Checking here, before the page is
 * rendered at all, keeps the instant shell for real pods and a correct status
 * for missing ones. The lookup is a single key read.
 */
export async function proxy(request: NextRequest) {
  const [, section, id] = request.nextUrl.pathname.split("/");
  if (!(await exists(section, id))) {
    // No route matches this path, so Next renders the not-found page with a 404.
    return NextResponse.rewrite(new URL("/_not-found-pod", request.url));
  }
  return NextResponse.next();
}

async function exists(section: string | undefined, id: string | undefined): Promise<boolean> {
  const { pods } = getContainer();
  if (section === "pods") return podIdSchema.safeParse(id).success && pods.exists(id!);
  if (section === "share") {
    return shareIdSchema.safeParse(id).success && (await pods.getByShareId(id!)) !== null;
  }
  return true;
}

export const config = {
  matcher: ["/pods/:id", "/share/:id"],
};
