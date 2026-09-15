# MediKiosk — Project Instructions for Claude Code

SIH 2026, Problem Statement SIH26047, "Patient Case-Taking Software".
Owner: All India Institute of Ayurveda, Ministry of Ayush. Category: Software.

Read this file fully at the start of every session. If a request in the chat
conflicts with a rule here, say so before acting.

This is a one-day sprint build by a single operator. Prefer working over
complete. Do not refactor code you did not write in this session.

## What this product is

A pre-consultation intake platform. A patient in an OPD waiting area records a
full structured clinical history by speaking or tapping, photographs their old
prescriptions and reports, and the physician opens the consultation already
holding a verified history and a dated document timeline.

It is **not** a triage system, **not** a diagnosis system, and **not** a
symptom checker. Red-flag detection exists only to stop a time-critical patient
from sitting in a queue. Every clinical output is a draft for a physician to
accept, amend or reject.

## Hard rules

1. **No secret ever reaches client code.** The Gemini key lives in
   `.env.local` and is read only inside `app/api/**` route handlers and
   `lib/model.ts`. Never in a component, never in a `NEXT_PUBLIC_` variable. If
   you are about to do this, stop and say so.
2. **The rule-based safety layer may only escalate.** A model can raise a
   priority. Nothing may lower a deterministic rule hit. Final priority is the
   maximum across all sources.
3. **No autonomous diagnosis.** No screen states a diagnosis as fact. Model
   output is labelled a draft and shows the source text that produced it.
4. **Every external call has a timeout and a local fallback.** The demo runs on
   congested venue wifi. Timeout at 8 seconds, then fall back to the offline
   path and keep the patient journey moving.
5. **All patient data is synthetic.** The free Gemini tier's terms permit Google
   to use submitted content to improve its products, so no real health data is
   ever sent.
6. **Clinical question trees live in JSON under `/ontology`, never in code.**
7. **No clinical validation is claimed anywhere in the UI or the deck.**
   Questions are traceable to the problem statement or to a named framework
   (SOCRATES). Say so on screen in the physician view.

## Stack

- **Next.js 16** App Router, TypeScript, Tailwind CSS. This is Next 16, not 14.
  `params` and `searchParams` are Promises and must be awaited in every route
  handler and every page. Do not write Next 14 style.
- Storage in `lib/db.ts`, all functions async. Locally: SQLite via
  `better-sqlite3`, one file at `data/medikiosk.db`. On Vercel: Upstash Redis
  when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Without
  them the SQLite file falls back to the temp folder, which is per instance and
  not durable. Never open the database at module load; the Vercel project folder
  is read-only and that crashed every `/api/session` call.
- Dev server on port 3100, because port 3000 is in use by an unrelated project
  on this machine. Set in `package.json`.
- Speech in the browser: Web Speech API, wrapped in `lib/asr.ts`.
- Model calls: Gemini, wrapped in `lib/model.ts`, called only from API routes.
- Output standard: FHIR R4, assembled in `lib/fhir.ts`.
- Node 24, npm 11. `npm` only, no yarn or pnpm.
- Machine path: `D:\SIH\medikiosk`.

There is no `AGENTS.md` in this project. This file is the only instruction file.
If one appears, delete it rather than maintaining both.

## Frozen contracts

These types live in `lib/types.ts` and are frozen after the scaffold packet.
Do not rename, extend or reshape them in a later packet. If a change seems
necessary, say so and stop.

```ts
export type Lang = "en" | "hi";
export type Mode = "allopathic" | "ayush";

export interface Localised { en: string; hi: string; }

export interface Option {
  id: string;
  label: Localised;
  icon?: string;        // emoji or lucide icon name
  value: string;        // canonical value stored
}

export type Section =
  | "chief_complaint" | "hpi" | "past_history" | "drug_allergy"
  | "family" | "personal" | "ros" | "ayush";

export interface HistoryNode {
  id: string;
  section: Section;
  prompt: Localised;
  answerType: "text" | "single" | "multi" | "number" | "duration";
  options?: Option[];
  next?: { default?: string; when?: { answerIn: string[]; goto: string }[] };
  fhir?: { resource: string; path: string };
  concepts?: string[];  // concept keys this answer can raise
  source: string;       // "PS 3.3 Module A" or "SOCRATES" — traceability
}

export interface Answer { nodeId: string; raw: string; value: string; via: "voice" | "tap" | "type"; }

export interface ExtractedDoc {
  id: string;
  kind: "prescription" | "lab_report" | "discharge_summary" | "unknown";
  date: string | null;
  diagnoses: string[];
  medications: { name: string; dose?: string; frequency?: string }[];
  labs: { name: string; value: string; unit?: string; refRange?: string; abnormal: boolean }[];
  rawText: string;
}

export interface RedFlag { level: "high" | "moderate" | "none"; concept: string | null; reason: string; }

export interface Summary {
  chiefComplaint: string; hpi: string; pastHistory: string;
  drugAllergy: string; family: string; personal: string;
  ros: string; priorInvestigations: string;
  ayush?: Record<string, string>;
}

export interface Session {
  id: string; name: string; age: number; gender: string;
  lang: Lang; mode: Mode;
  answers: Answer[]; documents: ExtractedDoc[];
  redFlag: RedFlag; summary?: Summary; fhirBundle?: unknown;
  status: "in_progress" | "pending_review" | "confirmed";
  createdAt: string;
}
```

## Frozen API routes

Each is a file under `app/api/`. Dynamic segments are Promises in Next 16:
`{ params }: { params: Promise<{ id: string }> }`, then `const { id } = await params`.

    POST /api/session                  -> { session }      create
    GET  /api/session/[id]             -> { session }
    POST /api/session/[id]/answer      -> { session }      body: Answer
    POST /api/session/[id]/document    -> { session }      body: { imageBase64 }
    POST /api/session/[id]/summary     -> { session }      generates Summary + FHIR
    POST /api/session/[id]/confirm     -> { session }      physician sign-off
    GET  /api/queue                    -> { sessions[] }

## Scope discipline

One person is building this across seven sequential packets, listed in
`docs/build-order.md`. Work only on the files named in the current packet. If a
change seems to require editing a file from another packet, say so and stop
rather than editing it.

One packet per session. Do not begin the next packet in the same session.

## Accessibility floor

Non-negotiable, taken from the problem statement. Base body text 18px minimum.
Touch targets 60px minimum. One question per screen. Inline errors, never
`alert()`. Every question answerable by speaking **or** by tapping a large
labelled option. Audio prompt on every screen in the selected language.
High-contrast toggle on the landing screen.

## Language handling

Hindi and English. Devanagari is the working script for Hindi, not romanised
Hinglish. Normalisation keeps Unicode combining marks (`\p{M}`), folds
chandrabindu to anusvara, drops nukta. A `\p{L}\p{N}` filter silently deletes
every Devanagari vowel sign. This defect cost a full debugging round in the
earlier prototype.

Negation is two different things. Denial of a symptom ("सीने में दर्द नहीं है")
suppresses the concept. Negated inability ("साँस नहीं आ रही", "खून नहीं रुक रहा",
"cannot breathe", "won't stop") **escalates** it. The earlier prototype deleted
both, which sent respiratory distress and uncontrolled bleeding to the bottom of
the queue. Do not reintroduce that.

Never put the Hindi copula "है" in an affirmative-token list. It makes every
declarative sentence read as a yes.

## Microphone lifecycle

Seven rules, each fixing a measured defect in the earlier prototype. Any change
to `lib/asr.ts` must keep all seven.

1. One `SpeechRecognition` instance for the whole session, created lazily and
   reused. A new instance per tap kills the microphone after three answers.
2. `abortVoice()` runs on every screen change, because a re-render detaches any
   DOM node captured when listening began.
3. Tapping an already-listening mic stops it, never starts a second recognition.
4. On `InvalidStateError`, abort and retry once after 300ms, then show a message.
5. A 12 second watchdog aborts a recognition that never fires `onend`.
6. `warmUpMicrophone()` calls `getUserMedia` once at session start and releases
   the track, keeping only the grant.
7. Dictation replaces the field value, never appends, so a retry cannot double
   the text.

## Writing style for UI copy and generated prose

Plain and direct. Banned: leverage, utilize, foster, seamless, robust, holistic,
ensure, insights, paradigm, delve, cutting-edge, game changer. No em dashes, no
semicolons, no exclamation marks.

## Before you commit

- Does any client file contain a key, or read `process.env` outside `app/api`
  and `lib/model.ts`?
- Does the change let anything lower a rule-based priority?
- Does every new question work by tap as well as by voice?
- Is new question text in an ontology JSON file rather than in code?
- Are `params` awaited in every dynamic route and page?
- Did you stay inside the current packet?

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
