import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession, saveSession } from "@/lib/db";
import type { ExtractedDoc } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await request.json().catch(() => ({})); // body: { imageBase64 } — extraction added in a later packet

  const doc: ExtractedDoc = {
    id: randomUUID(),
    kind: "unknown",
    date: null,
    diagnoses: [],
    medications: [],
    labs: [],
    rawText: "",
  };

  session.documents.push(doc);
  saveSession(session);
  return NextResponse.json({ session });
}
