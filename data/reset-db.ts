/* npm run reset-db. Deletes the local sqlite file (and any WAL/journal
   siblings) and recreates the schema through lib/db.ts ensureSchema().
   Only touches the SQLite backend. If UPSTASH_REDIS_REST_URL is set, clear
   the Redis database from the Upstash console instead. */

import fs from "fs";
import { ensureSchema, sqlitePath } from "../lib/db.ts";

const dbPath = sqlitePath();

for (const suffix of ["", "-wal", "-shm", "-journal"]) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`Deleted ${file}`);
  }
}

console.log(`Schema recreated at ${ensureSchema()}`);
