/* npm run seed. Wipes in the sense of adding fresh synthetic patients on top
   of whatever is already in data/medikiosk.db — pair with `npm run reset-db`
   first for a clean demo queue. See data/demoPatients.ts for what gets
   inserted and why. */

import { listSessions } from "../lib/db.ts";
import { seedDemoQueue } from "./demoPatients.ts";
import type { RedFlag, Session } from "../lib/types.ts";

const RANK: Record<RedFlag["level"], number> = { high: 2, moderate: 1, none: 0 };

// Mirrors app/api/queue/route.ts's ordering exactly, so this print is the
// queue the physician page will actually show.
function byPriority(a: Session, b: Session): number {
  const rank = RANK[b.redFlag.level] - RANK[a.redFlag.level];
  if (rank !== 0) return rank;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function printQueue(sessions: Session[]): void {
  const rows = [...sessions].sort(byPriority).map((s) => ({
    token: String(s.token ?? "-"),
    name: s.name,
    mode: s.mode,
    level: s.redFlag.level,
    status: s.status,
  }));

  const headers = { token: "Token", name: "Name", mode: "Mode", level: "Level", status: "Status" } as const;
  const cols = Object.keys(headers) as (keyof typeof headers)[];
  const widths = Object.fromEntries(
    cols.map((c) => [c, Math.max(headers[c].length, ...rows.map((r) => r[c].length))]),
  ) as Record<keyof typeof headers, number>;

  const line = (cells: Record<keyof typeof headers, string>) =>
    cols.map((c) => cells[c].padEnd(widths[c])).join("  ");

  console.log(line(headers));
  console.log(cols.map((c) => "-".repeat(widths[c])).join("  "));
  for (const row of rows) console.log(line(row));
}

async function main() {
  console.log("Seeding demo queue...");
  const created = await seedDemoQueue();
  for (const s of created) {
    console.log(`  token ${s.token}: ${s.name} (${s.mode}, ${s.lang}) -> ${s.redFlag.level}`);
  }

  console.log("\nQueue order (as the physician page will show it):\n");
  printQueue(listSessions());
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exitCode = 1;
});
