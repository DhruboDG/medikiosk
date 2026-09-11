import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/db";
import type { Answer } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const answer = (await request.json()) as Answer;
  const existingIndex = session.answers.findIndex((a) => a.nodeId === answer.nodeId);

  if (existingIndex >= 0) {
    session.answers[existingIndex] = answer;
  } else {
    session.answers.push(answer);
  }

  saveSession(session);
  return NextResponse.json({ session });
}
