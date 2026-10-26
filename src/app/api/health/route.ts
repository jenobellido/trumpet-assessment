import { connection } from "next/server";
import { getContainer } from "@/server/container";

export async function GET() {
  await connection();
  return Response.json({ status: "ok", storage: getContainer().storage });
}
