import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Session } from "./types";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "medikiosk.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    json TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  )
`);

// Stable, sequential patient token numbers. Assigned once at session creation
// (see app/api/session/route.ts) and stored on the session, so it does not
// shift as the queue changes later.
export function nextToken(): number {
  db.prepare(
    "INSERT INTO counters (name, value) VALUES ('token', 0) ON CONFLICT(name) DO NOTHING"
  ).run();
  const row = db
    .prepare("UPDATE counters SET value = value + 1 WHERE name = 'token' RETURNING value")
    .get() as { value: number };
  return row.value;
}

export function getSession(id: string): Session | null {
  const row = db.prepare("SELECT json FROM sessions WHERE id = ?").get(id) as
    | { json: string }
    | undefined;
  if (!row) return null;
  return JSON.parse(row.json) as Session;
}

export function saveSession(session: Session): void {
  db.prepare(
    "INSERT INTO sessions (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json"
  ).run(session.id, JSON.stringify(session));
}

export function listSessions(): Session[] {
  const rows = db.prepare("SELECT json FROM sessions").all() as { json: string }[];
  return rows.map((row) => JSON.parse(row.json) as Session);
}

// token lives inside the json blob, so this is a scan rather than an indexed
// lookup. Fine at kiosk scale (a day's worth of sessions); revisit with a
// dedicated column if that ever stops being true.
export function getSessionByToken(token: number): Session | null {
  return listSessions().find((session) => session.token === token) ?? null;
}
