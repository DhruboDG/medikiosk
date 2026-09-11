import { NextResponse } from "next/server";
import { listSessions } from "@/lib/db";
import type { RedFlag, Session } from "@/lib/types";

const RANK: Record<RedFlag["level"], number> = { high: 2, moderate: 1, none: 0 };

// Most urgent red flag first, then first-arrived first, so queue ordering is
// a property of the API and not left to whichever view happens to sort it.
function byPriority(a: Session, b: Session): number {
  const rank = RANK[b.redFlag.level] - RANK[a.redFlag.level];
  if (rank !== 0) return rank;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export async function GET() {
  const sessions = listSessions().sort(byPriority);
  return NextResponse.json({ sessions });
}
