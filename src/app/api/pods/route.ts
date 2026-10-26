import { connection } from "next/server";
import { getContainer } from "@/server/container";

export async function GET(request: Request) {
  await connection(); // always read fresh data, never prerender
  return getContainer().http.pods.list(request);
}

export async function POST(request: Request) {
  return getContainer().http.pods.create(request);
}
