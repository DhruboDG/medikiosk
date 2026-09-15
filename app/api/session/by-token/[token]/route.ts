import { NextRequest, NextResponse } from "next/server";
import { getSessionByToken } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const tokenNumber = Number(token);

  if (!Number.isFinite(tokenNumber)) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const session = await getSessionByToken(tokenNumber);

  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}
