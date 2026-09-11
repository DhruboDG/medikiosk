import { NextResponse } from "next/server";
import { listSessions } from "@/lib/db";

export async function GET() {
  const sessions = listSessions();
  return NextResponse.json({ sessions });
}
