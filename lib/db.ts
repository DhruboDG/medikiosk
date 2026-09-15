import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";
import type { Session } from "./types";

/* Session storage. Two backends behind the same five functions.

   1. Upstash Redis, over its REST API, when a URL and token are set.
      Vercel's Upstash integration injects UPSTASH_REDIS_REST_URL and
      UPSTASH_REDIS_REST_TOKEN (older projects get KV_REST_API_URL and
      KV_REST_API_TOKEN, also accepted). Use this on Vercel: every function
      instance reads and writes the same data, and it survives restarts.

   2. SQLite via better-sqlite3 otherwise. On a laptop the file stays at
      data/medikiosk.db, as before. On Vercel the project folder is read-only
      and data/ is not deployed, which is what produced
      "SqliteError: unable to open database file" on POST /api/session. There
      the file goes to the temp folder instead. That keeps the app working
      with no setup, but the temp folder belongs to one server instance and is
      wiped when Vercel recycles it, so sessions can disappear. Stopgap only.

   The SQLite file is opened on first use, not when this module is imported,
   so a storage failure is reported by the route that hit it instead of
   crashing module evaluation.

   All functions are async because the Redis backend is a network call. */

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

/* The integration lets you pick a custom prefix when connecting the database
   (e.g. MEDIKIOSK_KV_REST_API_URL). The known names are tried first, then any
   *_REST_API_URL / *_REDIS_REST_URL variable with a matching *_TOKEN twin. */
function redisCredentials(): { url: string; token: string } {
  const env = process.env;
  const pairs: [string, string][] = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ];
  for (const key of Object.keys(env)) {
    if (key.endsWith("_REST_API_URL") || key.endsWith("_REDIS_REST_URL")) {
      pairs.push([key, key.replace(/_URL$/, "_TOKEN")]);
    }
  }
  for (const [urlKey, tokenKey] of pairs) {
    const url = env[urlKey];
    const token = env[tokenKey];
    if (url && token) return { url, token };
  }
  return { url: "", token: "" };
}

const { url: REDIS_URL, token: REDIS_TOKEN } = redisCredentials();
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

export function storageBackend(): "redis" | "sqlite" {
  return USE_REDIS ? "redis" : "sqlite";
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

/** Where the SQLite file lives. DB_PATH wins, then Vercel's temp folder, then data/. */
export function sqlitePath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.VERCEL) return path.join(os.tmpdir(), "medikiosk.db");
  return path.join(process.cwd(), "data", "medikiosk.db");
}

let sqlite: Database.Database | null = null;

function openSqlite(file: string): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
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
  return db;
}

function getSqlite(): Database.Database {
  if (sqlite) return sqlite;
  const preferred = sqlitePath();
  try {
    sqlite = openSqlite(preferred);
  } catch (err) {
    // Any host with a read-only project folder: retry in the temp folder.
    const fallback = path.join(os.tmpdir(), "medikiosk.db");
    if (preferred === fallback) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[db] could not open ${preferred} (${reason}), using ${fallback}`);
    sqlite = openSqlite(fallback);
  }
  return sqlite;
}

/** Opens the store and creates the SQLite schema. Used by `npm run reset-db`. */
export function ensureSchema(): string {
  if (USE_REDIS) return "redis";
  getSqlite();
  return sqlite ? sqlite.name : sqlitePath();
}

// ---------------------------------------------------------------------------
// Redis backend (Upstash REST API, plain fetch, no extra package)
// ---------------------------------------------------------------------------

const REDIS_TIMEOUT_MS = 5000;
const KEY_PREFIX = "medikiosk";
const SESSION_KEY = (id: string) => `${KEY_PREFIX}:session:${id}`;
const SESSION_INDEX = `${KEY_PREFIX}:sessions`;
const TOKEN_COUNTER = `${KEY_PREFIX}:counter:token`;

type RedisValue = string | number | null | RedisValue[];

async function redis(command: (string | number)[]): Promise<RedisValue> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(REDIS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { result?: RedisValue; error?: string };
    if (!res.ok || data.error) {
      throw new Error(`Redis ${command[0]} failed: ${data.error ?? res.status}`);
    }
    return data.result ?? null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Stable, sequential patient token numbers. Assigned once at session creation
// (see app/api/session/route.ts) and stored on the session, so it does not
// shift as the queue changes later.
export async function nextToken(): Promise<number> {
  if (USE_REDIS) {
    return Number(await redis(["INCR", TOKEN_COUNTER]));
  }
  const db = getSqlite();
  db.prepare(
    "INSERT INTO counters (name, value) VALUES ('token', 0) ON CONFLICT(name) DO NOTHING"
  ).run();
  const row = db
    .prepare("UPDATE counters SET value = value + 1 WHERE name = 'token' RETURNING value")
    .get() as { value: number };
  return row.value;
}

export async function getSession(id: string): Promise<Session | null> {
  if (USE_REDIS) {
    const json = await redis(["GET", SESSION_KEY(id)]);
    return typeof json === "string" ? (JSON.parse(json) as Session) : null;
  }
  const row = getSqlite().prepare("SELECT json FROM sessions WHERE id = ?").get(id) as
    | { json: string }
    | undefined;
  if (!row) return null;
  return JSON.parse(row.json) as Session;
}

export async function saveSession(session: Session): Promise<void> {
  if (USE_REDIS) {
    await redis(["SET", SESSION_KEY(session.id), JSON.stringify(session)]);
    await redis(["SADD", SESSION_INDEX, session.id]);
    return;
  }
  getSqlite()
    .prepare(
      "INSERT INTO sessions (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json"
    )
    .run(session.id, JSON.stringify(session));
}

export async function listSessions(): Promise<Session[]> {
  if (USE_REDIS) {
    const ids = (await redis(["SMEMBERS", SESSION_INDEX])) as string[] | null;
    if (!ids || ids.length === 0) return [];
    const values = (await redis(["MGET", ...ids.map(SESSION_KEY)])) as (string | null)[];
    return values
      .filter((v): v is string => typeof v === "string")
      .map((v) => JSON.parse(v) as Session);
  }
  const rows = getSqlite().prepare("SELECT json FROM sessions").all() as { json: string }[];
  return rows.map((row) => JSON.parse(row.json) as Session);
}

// token lives inside the json blob, so this is a scan rather than an indexed
// lookup. Fine at kiosk scale (a day's worth of sessions); revisit with a
// dedicated column if that ever stops being true.
export async function getSessionByToken(token: number): Promise<Session | null> {
  const sessions = await listSessions();
  return sessions.find((session) => session.token === token) ?? null;
}
