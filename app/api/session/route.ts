import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveSession } from "@/lib/db";
import type { Session } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const session: Session = {
    id: randomUUID(),
    name: body.name ?? "",
    age: body.age ?? 0,
    gender: body.gender ?? "",
    lang: body.lang ?? "en",
    mode: body.mode ?? "allopathic",
    answers: [],
    documents: [],
    redFlag: { level: "none", concept: null, reason: "" },
    status: "in_progress",
    createdAt: new Date().toISOString(),
  };

  saveSession(session);
  return NextResponse.json({ session });
}
