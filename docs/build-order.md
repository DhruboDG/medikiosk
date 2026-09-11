# MediKiosk — Solo Build Order

One operator, one day, Claude Code in `D:\SIH\medikiosk`, dev server on port 3100.

Work on `main`. No branches. Commit after every packet so you can always roll
back to the last thing that worked.

**Stack note.** This project scaffolded on Next.js 16, not 14. `params` and
`searchParams` are Promises and must be awaited in every route handler and page.
Every prompt below relies on `CLAUDE.md` saying so, which it does. If a build
error mentions `params` being a Promise, that is the cause.

**Session hygiene.** Start a fresh Claude Code session for each packet and run
`/clear` between them. Every prompt below begins by re-reading `CLAUDE.md`,
because a fresh session has no memory of the last one. A single long session
across all seven packets will drift and will start editing files it should
leave alone.

**The cut line is after packet 4.** If you reach hour 9 and packet 4 is not
finished, stop adding and start polishing. A demo that runs is worth more than
a demo that covers more ground.

---

## Time budget

    0  Scaffold                    45 min
    1  Ontology, concepts, flags    2 h 30
    2  Kiosk shell and voice        1 h 30
    3  End-to-end journey           1 h      <- first demoable moment
    4  Physician view, summary, FHIR 2 h     <- cut line
    5  AYUSH branch                 1 h
    6  Documents and OCR            1 h 30
    7  Seed, polish, record, deck   1 h 30

That totals close to twelve hours with no slack. Assume you lose an hour
somewhere. Packet 6 is the first thing to drop, packet 5 the second.

---

## Packet 0 — Scaffold

Run this first, in a fresh Claude Code session opened in `D:\SIH\medikiosk`.

**Prompt:**

```
Read CLAUDE.md and docs/build-order.md in full before writing anything.

Build only the scaffold. Nothing else.

1. lib/types.ts — the frozen contracts from CLAUDE.md, copied verbatim, no
   additions or renames.
2. lib/db.ts — better-sqlite3 at data/medikiosk.db, one table `sessions`
   (id TEXT PRIMARY KEY, json TEXT), exporting getSession, saveSession,
   listSessions. The Session object is stored as JSON in the json column.
3. lib/model.ts — export callGemini(prompt, images?) calling the Gemini API with
   an AbortController timeout of 8 seconds, returning null on any error, timeout
   or non-200 response. Reads GEMINI_API_KEY from process.env. Server-side only.
4. The seven API routes from CLAUDE.md as working stubs under app/api. Each
   loads the session, applies the request body, saves it and returns { session }.
   No business logic, no model calls yet. This is Next.js 16, so await params in
   every dynamic route handler.
5. app/page.tsx — a placeholder landing screen only.

Do not create any component files. Do not create any ontology JSON. Do not
create app/physician. Do not write the Gemini key anywhere outside lib/model.ts.
Do not run git commands.

When done, list the files you created and run `npm run build` to confirm it
compiles.
```

**Verify before moving on.** `npm run build` compiles. `npm run dev` serves the
placeholder at `http://localhost:3100`. POST to `/api/session` with curl or the
browser console returns a session object, and `data/medikiosk.db` appears on disk.

Commit: `Scaffold, contracts, database and API stubs`

---

## Packet 1 — Ontology engine, concepts, red flags

The spine. Everything else depends on it, so it goes first and gets the most time.

**Prompt:**

```
Read CLAUDE.md and lib/types.ts in full.

Build the clinical question engine and the safety layer. Files: lib/ontology.ts,
lib/concepts.ts, lib/redflag.ts, ontology/general.json, lib/concepts.test.ts.

ontology/general.json is an array of HistoryNode:
- cc_open: free text, "What brings you here today?" / "आज आप किस तकलीफ से आए हैं?"
- Branch from the concepts raised by cc_open into chest, respiratory, abdominal,
  fever, or general.
- The chest branch has the seven SOCRATES nodes: site, onset, character,
  radiation, associated symptoms, timing, exacerbating and relieving factors,
  severity. source: "SOCRATES" on each.
- After the branch, every patient answers fixed sections: past medical and
  surgical, drug and allergy, family, personal habits, review of systems. Two to
  four nodes each, source: "PS 3.3 Module C".
- Every node with answerType "single" needs three to five tap options with an
  emoji icon and labels in English and Hindi Devanagari.

lib/ontology.ts exports loadTree(mode), nextNode(tree, answers) evaluating
next.when before next.default, and progress(tree, answers).

lib/concepts.ts: I am pasting the CONCEPTS table and normalizeText from an
earlier prototype below. Port them, keeping the \p{M} fix in normalizeText, and
apply two corrections:
 (a) Split negation into two behaviours. A clause with a negation token plus a
     symptom concept suppresses that concept. A clause with a negation token
     plus an ability or stopping verb (आ रही, रुक, बोल, पा, breathe, stop, speak,
     move) raises the concept instead. Add cannot, cant, dont, doesnt, didnt,
     wont, isnt, havent to the negation tokens.
 (b) Remove "है" from the affirmative tokens entirely.

lib/redflag.ts exports evaluate(session): RedFlag. Run concepts over the
complaint AND every answer, take the maximum, never lower a hit. Breathlessness,
unconscious, stroke, bleeding, coughing blood, choking and severe burn are high
on their own. Chest pain alone is moderate, and high only if onset is under 24
hours or a second cardiac concept is present.

Write lib/concepts.test.ts FIRST with these six cases, run it, show me the
failures, then implement until they pass:
  "साँस नहीं आ रही है"            -> breathlessness, high
  "खून नहीं रुक रहा"               -> bleeding, high
  "I can not breathe"              -> breathlessness, high
  "I don't have chest pain"        -> chest_pain NOT raised
  "सीने में दर्द नहीं है, खांसी है"  -> cough only
  "दो साल पहले सीने में दर्द हुआ था" -> not high

Do not create components, do not touch app/api, do not edit lib/types.ts.

[paste the CONCEPTS block and normalizeText from medikiosk-mvp_5.html here]
```

**Verify before moving on.** All six tests pass. Then open a Node REPL and feed
three phrases of your own invention through `conceptsIn` to check it is not
overfitted to the test set.

Commit: `Ontology engine, concept layer, red-flag rules`

---

## Packet 2 — Kiosk shell and voice

**Prompt:**

```
Read CLAUDE.md.

Build lib/asr.ts, lib/tts.ts, components/VoiceInput.tsx,
components/KioskShell.tsx, and the type scale in app/globals.css.

lib/asr.ts must follow all seven rules, each of which fixes a measured defect in
an earlier prototype:
 1. One SpeechRecognition instance for the whole session, created lazily and
    reused. A new instance per tap kills the microphone after three answers.
 2. abortVoice() runs on every screen change, because render replaces the DOM
    and handlers hold detached nodes.
 3. Tapping an already-listening mic stops it, never starts a second recognition.
 4. On InvalidStateError, abort and retry once after 300ms, then show a message.
 5. A 12 second watchdog aborts a recognition that never fires onend.
 6. warmUpMicrophone() calls getUserMedia once at session start and releases the
    track, keeping only the grant.
 7. Dictation replaces the field value, never appends, so a retry cannot double
    the text.

lib/tts.ts exports speak(text, lang) using getVoices(), with an on-screen
warning when no Hindi voice is installed.

components/VoiceInput.tsx: 60px mic button, live interim text, a read-back strip
showing what was captured, an inline error box. Never alert().

components/KioskShell.tsx: one question per screen, 18px base type, 60px touch
targets, progress indicator, language toggle, high-contrast toggle, and a
persistent "listen again" button replaying the current prompt.

Do not touch lib/ontology.ts, lib/concepts.ts, lib/redflag.ts or app/api.
```

**Verify.** Open the app, tap the mic, speak Hindi, stop, tap again, speak again.
Do it six times without reloading. If the mic dies, stop and fix it now. This
exact failure broke the previous prototype and it will break the demo.

Commit: `Kiosk shell, speech input and audio prompts`

---

## Packet 3 — End-to-end journey

Integration checkpoint. After this you have something to show.

**Prompt:**

```
Read CLAUDE.md, lib/types.ts and lib/ontology.ts.

Wire the full patient journey using the existing API route stubs:
 app/page.tsx          language choice, high-contrast toggle, Start
 app/intake/page.tsx   name, age, gender, then the question loop driven by
                       nextNode, rendering each node through KioskShell with
                       both tap options and VoiceInput
 app/done/page.tsx     confirmation screen with the token number

Each answer POSTs to /api/session/[id]/answer. The route recomputes redflag via
lib/redflag.ts and returns the updated session. Session id is held in a React
context, never in localStorage.

Every screen has an audio prompt in the selected language. Every question is
answerable by tapping an option or by speaking. Errors are inline.

Do not build the physician view yet. Do not call Gemini yet.
```

**Verify.** Walk the whole journey twice, once in Hindi entirely by voice, once
in English entirely by tapping. Fix every dead end before continuing. Record a
screen capture of this working journey now, as your first fallback video.

Commit: `End-to-end patient intake journey`

---

## Packet 4 — Physician view, summary, FHIR

**Prompt:**

```
Read CLAUDE.md and lib/types.ts.

Build lib/summary.ts, lib/fhir.ts, app/physician/page.tsx and
app/physician/[id]/page.tsx.

lib/summary.ts builds a prompt from the answers and calls callGemini, returning
the Summary shape in the exact problem-statement order: chief complaint, HPI,
past medical and surgical, drug and allergy, family, personal, review of systems,
prior investigations. Demand JSON only, strip code fences, parse defensively. If
callGemini returns null or parsing fails, fall back to template assembly from the
raw answers so the screen is never empty.

lib/fhir.ts assembles a FHIR R4 Bundle of type "document" containing
Composition, Patient, Encounter, Condition, MedicationStatement, Observation per
lab value, AllergyIntolerance and DocumentReference.

app/physician/page.tsx: the queue sorted by red-flag level then arrival time,
with the complaint line and a priority badge.

app/physician/[id]/page.tsx: the summary in standard order with every field
editable, the red-flag reason shown together with the patient's own words that
triggered it, a collapsible "FHIR bundle" panel showing the JSON, and Accept,
Amend, Reject buttons hitting /api/session/[id]/confirm.

A fixed footer on every physician screen: draft generated from patient
self-report, not clinically validated, physician confirmation required.

The model call belongs in the API route, not in a component. Do not put the key
anywhere outside lib/model.ts.
```

**Verify.** Complete an intake, open the physician view, confirm the summary
fills all eight fields. Then disconnect the network and run a second intake. The
summary must still appear from the template fallback. If it does not, the demo
fails on venue wifi.

Commit: `Physician view, summary generation and FHIR bundle`

**This is the cut line.** You now have a defensible demo. Everything below is
upside.

---

## Packet 5 — AYUSH branch

Cheap and it is your differentiator. An hour of JSON.

**Prompt:**

```
Read CLAUDE.md and lib/types.ts.

Create ontology/ayush.json conforming to HistoryNode, covering the ten
Dashavidha Pariksha parameters named in the problem statement plus Ahara-Vihara:
Prakriti, Vikriti, Sara, Samhanana, Pramana, Satmya, Sattva, Ahara Shakti,
Vyayama Shakti, Vaya. One to three nodes each. source: "PS 3.3 Module A" on
every node. Tap options in English and Hindi Devanagari, worded as patient
self-report of observable traits, never as a verdict.

Do NOT compute or display a dosha result anywhere. Capture the answers only.

Add a mode selector on app/page.tsx choosing allopathic or AYUSH, and make
loadTree(mode) return this tree for AYUSH.

Build components/AyushPanel.tsx showing captured answers grouped by parameter,
rendered in app/physician/[id]/page.tsx when mode is ayush.

On every AYUSH screen and on the panel header, one line: this is a structured
record of the Dashavidha Pariksha for the vaidya to interpret, not a
constitutional assessment produced by software.
```

**Verify.** Run an AYUSH intake end to end and confirm all ten parameters reach
the physician panel.

Commit: `AYUSH Dashavidha Pariksha intake mode`

---

## Packet 6 — Documents and OCR

The first thing to drop if time is short.

**Prompt:**

```
Read CLAUDE.md and lib/types.ts.

Build components/DocumentUpload.tsx, components/Timeline.tsx, and the handler
body for app/api/session/[id]/document/route.ts.

DocumentUpload: camera or file input with a 60px target, thumbnail list, one-tap
delete, visible progress state. Added as an optional step after the questions.

The route sends the image to Gemini vision with a strict instruction to return
only JSON matching ExtractedDoc: kind, date, diagnoses, medications with dose and
frequency, labs with value, unit, reference range and an abnormal boolean, plus
rawText. Parsing must never throw. On any failure return kind "unknown" with
rawText only, and never block the journey.

Timeline: documents sorted by date newest first, undated ones grouped at the
bottom. Abnormal lab values in red with the reference range beside them. Every
extracted field carries a small "draft, verify" marker. Render it in the
physician detail page.
```

**Verify.** Test with two printed lab reports and one handwritten prescription.
Note what the handwriting run actually returns, because you will be asked and
the honest answer is better than the optimistic one.

Commit: `Document capture, extraction and timeline`

---

## Packet 7 — Seed, polish, record, deck

**Prompt:**

```
Read CLAUDE.md.

Create data/seed.ts inserting six synthetic sessions: three in Hindi, one in
AYUSH mode, one at high priority, one carrying three extracted documents. Add an
npm script "seed" that runs it. Add a "Load demo queue" button on the physician
page for when the network fails.

Then audit every screen against the accessibility floor in CLAUDE.md: 18px base
type, 60px touch targets, one question per screen, inline errors only, no
alert(), audio prompt present, high-contrast toggle working. List what fails and
fix it.
```

Then, without Claude Code:

1. Seed, run the whole journey three times, and time it. Aim under five minutes.
2. Record the full screen capture: patient journey, AYUSH mode, documents,
   physician view, FHIR panel. This is the fallback if the venue network dies.
3. Write `docs/architecture.md`: the four modules mapped to the problem
   statement sections, the data flow, the escalate-only safety design, what is
   real and what is mocked, and the deployment path.
4. Build the twelve-slide deck listed in the previous plan.
5. Turn off wifi and run the journey once more.
6. Walk Dhrubo through the demo twice so he can run it without you.

Commit: `Demo data, accessibility pass, documentation`

---

## Standing rules while building alone

Commit after every packet, with a message that says what works. When something
breaks, `git log` gives you the last good state.

Never let Claude Code run more than one packet in a session. When it starts
touching files outside the packet, stop it and start a fresh session.

If a packet overruns its time box by more than thirty minutes, cut its optional
half rather than continuing. Losing a feature is recoverable. Arriving with a
broken build is not.

Read the code it writes for the safety layer specifically. The rest you can
accept on test evidence, but `lib/redflag.ts` decides who waits, and a model
that writes fluent wrong code there will produce a system that looks correct and
sorts patients badly. That is the defect you have already found once in this
project.
