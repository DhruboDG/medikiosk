import { NextResponse } from "next/server";
import { seedDemoQueue } from "@/data/demoPatients";

/* Not one of the frozen contracts in CLAUDE.md. Backs the physician page's
   "Load demo queue" button, for recovering a demo-ready queue if the venue
   database is lost. Adds the six synthetic patients on top of whatever is
   already in session storage (lib/db.ts); pair with `npm run reset-db` first
   for a clean local queue. */
export async function POST() {
  const sessions = await seedDemoQueue();
  return NextResponse.json({ sessions });
}
