import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Summary and FHIR bundle generation is added in a later packet.
  session.status = "pending_review";
  saveSession(session);
  return NextResponse.json({ session });
}
