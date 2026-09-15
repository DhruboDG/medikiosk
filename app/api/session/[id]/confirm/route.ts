import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/db";
import { buildFhirBundle } from "@/lib/fhir";
import type { Summary } from "@/lib/types";

interface ConfirmBody {
  action?: "accept" | "amend" | "reject";
  summary?: Summary;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmBody;

  // Composition.status is "final" only once the physician accepts the draft
  // as-is; amending or rejecting leaves it "preliminary" — the text may still
  // change, or was declined outright.
  if (body.summary) {
    session.summary = body.summary;
    session.fhirBundle = buildFhirBundle(session, body.summary, body.action === "accept");
  }

  // Session.status has no "rejected" value — it is frozen in lib/types.ts.
  // Accept and Amend both mean the physician signs off on what is on screen.
  // Reject means they will not sign off on this draft; it stays pending_review
  // so it is not lost from the queue, but any edited text is still saved.
  if (body.action !== "reject") {
    session.status = "confirmed";
  }

  await saveSession(session);
  return NextResponse.json({ session });
}
