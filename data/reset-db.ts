/* npm run reset-db. Deletes the sqlite file (and any WAL/journal siblings)
   and recreates the schema by importing lib/db.ts, which runs its
   CREATE TABLE IF NOT EXISTS statements on load. */

import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "medikiosk.db");

for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`Deleted ${file}`);
  }
}

await import("../lib/db.ts");
console.log(`Schema recreated at ${dbPath}`);
