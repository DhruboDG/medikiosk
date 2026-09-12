import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/db";
import { generateSummary } from "@/lib/summary";
import { buildFhirBundle } from "@/lib/fhir";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  session.summary = await generateSummary(session);
  session.fhirBundle = buildFhirBundle(session, session.summary);
  session.status = "pending_review";
  saveSession(session);
  return NextResponse.json({ session });
}
