import { NextRequest, NextResponse } from "next/server";
import { getSession, saveSession } from "@/lib/db";
import { evaluate, isEmergency } from "@/lib/redflag";
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

  // Red flag may only escalate. evaluate() takes the max of this and the
  // level the session already held, so a changed answer can never lower it.
  session.redFlag = evaluate(session);

  // An emergency concept stops the questionnaire, so the session goes
  // straight to physician review instead of waiting on the remaining answers.
  if (session.status === "in_progress" && isEmergency(session)) {
    session.status = "pending_review";
  }

  saveSession(session);
  return NextResponse.json({ session });
}
