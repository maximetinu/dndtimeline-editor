# Editable Campaign Timeline (Supabase) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only LegendKeeper-style timeline into a site that is public-read but editable (add/edit/delete events + upload images from a phone) by a small trusted group behind a shared campaign password, with no self-hosted backend.

**Architecture:** A dependency-free static front-end (GitHub Pages, new repo `dndtimeline-editor`) reads events live from Supabase using the public `anon` key. Writes require a Supabase session from a single shared "campaign editor" account; Row-Level Security (RLS) makes reads public and writes authenticated-only. Images live in a public Supabase Storage bucket. A weekly GitHub Action pings Supabase (anti-pause on the free tier) and snapshots events+images into the repo as a durable backup.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules, no bundler), `@supabase/supabase-js` v2 via ESM CDN, Supabase (Postgres + Auth + Storage), Python 3 (stdlib only) for migration/backup scripts, GitHub Actions, `psql` for DDL.

## Global Constraints

- **Do NOT touch or commit to the existing `dndtimeline` repo.** All work happens in a new repo `dndtimeline-editor` at `/Users/metinu/git/dndtimeline-editor/`.
- **Secrets never get committed:** the Supabase Personal Access Token and `service_role` key are used only via environment variables locally and via GitHub Secrets in the Action. Only the project URL and `anon` key (both public-safe by design) may live in committed code.
- **No build step for the front-end.** Plain ES modules loaded directly by the browser. supabase-js is imported from `https://esm.sh/@supabase/supabase-js@2`.
- **Date model:** events store `start_minutes` (bigint) = minutes since 0001-01-01 of the proleptic Gregorian calendar (same unit as the original LegendKeeper export). All human dates and "N years/days later" labels are computed in JS at render time.
- **Singleton:** one timeline. No multi-timeline, no per-user accounts, no realtime collaboration (async, last-write-wins).
- **Visual fidelity:** keep the existing arcane theme (`styles.css` + `theme-arcane.css`) unchanged.
- **Read-only by default:** no edit controls visible until the user unlocks edit mode via a discreet lock icon + shared password.
- **Source data for migration:** `/Users/metinu/git/dndtimeline/Tierras perdidas, sueños encontrados.json` (read-only input; copy it into the new repo, do not modify the original).

---

## File Structure

New repo `dndtimeline-editor/`:

```
index.html                     # page shell; loads ES modules
styles.css                     # base layout (copied verbatim from dndtimeline)
theme-arcane.css               # arcane theme (copied verbatim from dndtimeline)
js/
  config.js                    # PUBLIC Supabase URL + anon key + shared editor email
  supabaseClient.js            # creates and exports the supabase-js client
  dates.js                     # proleptic Gregorian math + label formatting (pure, tested)
  render.js                    # renders the timeline from an events array
  lightbox.js                  # detail/zoom modal (ported from app.js)
  edit.js                      # auth (lock→login), edit mode, CRUD forms, image upload
  main.js                      # entrypoint: fetch events → render; wire lock + edit mode
tests/
  dates.test.mjs               # node unit tests for js/dates.js
supabase/
  schema.sql                   # events table + RLS + storage bucket + storage policies
scripts/
  migrate.py                   # one-time: old JSON → Supabase rows + image uploads
  backup.py                    # dump events+images from Supabase into backup/
backup/                        # generated: events.json + images/*.webp (committed by the Action)
.github/workflows/
  keepalive-backup.yml         # weekly ping + backup commit
.gitignore
.env.example                   # documents required env vars (no real secrets)
README.md
```

Responsibilities are split so each file holds one concern: `dates.js` is pure logic (unit-tested), `render.js` only paints, `edit.js` only handles auth+mutations, `main.js` wires them. `config.js` is the only file with project-specific public values.

---

## Prerequisites (one-time, before Task 3)

These gate the Supabase tasks (3–6, 9, 10). Earlier tasks (1, 2) and later UI wiring do not need them, but the read path (Task 5) does.

- The user has a Supabase account and provides a **Personal Access Token** (PAT) exported as `SUPABASE_PAT` in the shell. (Chosen "full control" path: the assistant creates the project.)
- `psql` available (`brew install libpq && brew link --force libpq`) for applying DDL.
- `curl` and `python3` available (already present on macOS).

The plan's Supabase tasks include the exact commands; if `SUPABASE_PAT` is not yet set when reaching Task 3, pause and request it.

---

### Task 1: Scaffold the new repo from the current viewer (read-only, refactored into modules)

Establish `dndtimeline-editor` with the existing look, code split into ES modules, still rendering from a local sample so it is verifiable without Supabase.

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/index.html`
- Create: `/Users/metinu/git/dndtimeline-editor/styles.css` (copy of `dndtimeline/docs/styles.css`)
- Create: `/Users/metinu/git/dndtimeline-editor/theme-arcane.css` (copy of `dndtimeline/docs/theme-arcane.css`)
- Create: `/Users/metinu/git/dndtimeline-editor/js/dates.js`
- Create: `/Users/metinu/git/dndtimeline-editor/js/render.js`
- Create: `/Users/metinu/git/dndtimeline-editor/js/lightbox.js`
- Create: `/Users/metinu/git/dndtimeline-editor/js/main.js`
- Create: `/Users/metinu/git/dndtimeline-editor/js/sample-data.js` (temporary, removed in Task 5)
- Create: `/Users/metinu/git/dndtimeline-editor/.gitignore`
- Create: `/Users/metinu/git/dndtimeline-editor/README.md`

**Interfaces:**
- Produces: `renderTimeline(container, events)` from `render.js`, where each `event = { id, name, color, start_minutes, imageUrl }` (imageUrl is a fully-qualified URL string or null). `events` is assumed already sorted by `start_minutes`.
- Produces: `openDetail(event)` and `closeDetail()` from `lightbox.js`.
- Produces from `dates.js`: `minutesToYMD`, `ymdToMinutes`, `yearLabel`, `relativeLabel`, `dateText` (full signatures defined in Task 2).

- [ ] **Step 1: Initialize the repo and copy static assets**

```bash
mkdir -p /Users/metinu/git/dndtimeline-editor/js /Users/metinu/git/dndtimeline-editor/tests
cd /Users/metinu/git/dndtimeline-editor
git init
cp "/Users/metinu/git/dndtimeline/docs/styles.css" styles.css
cp "/Users/metinu/git/dndtimeline/docs/theme-arcane.css" theme-arcane.css
printf '.env\n.DS_Store\nnode_modules/\n' > .gitignore
printf '# dndtimeline-editor\n\nEditable campaign timeline backed by Supabase. See docs/superpowers/.\n' > README.md
```

- [ ] **Step 2: Create `js/dates.js` as a stub** (real logic + tests come in Task 2; stub keeps Task 1 renderable)

Port the proleptic algorithm from `dndtimeline/build.py`. Minimal version to unblock rendering:

```js
// js/dates.js
const MIN_PER_DAY = 1440;
function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function civilFromDays(z) {
  z += 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
}
const BASE = daysFromCivil(1, 1, 1);
export function minutesToYMD(min) { return civilFromDays(BASE + Math.round(min / MIN_PER_DAY)); }
export function ymdToMinutes(y, m, d) { return (daysFromCivil(y, m, d) - BASE) * MIN_PER_DAY; }
export function yearLabel(year) { return year > 0 ? `${year} CE` : `${1 - year} BCE`; }
export function dateText(min) { return yearLabel(minutesToYMD(min).year); }
export function relativeLabel(prevMin, curMin) {
  if (prevMin == null) return "";
  const a = minutesToYMD(prevMin), b = minutesToYMD(curMin);
  let years = b.year - a.year;
  if (b.month < a.month || (b.month === a.month && b.day < a.day)) years -= 1;
  if (years >= 1) return `${years} year${years === 1 ? "" : "s"} later`;
  const days = Math.round((curMin - prevMin) / MIN_PER_DAY);
  if (days === 0) return "same day";
  return `${days} day${days === 1 ? "" : "s"} later`;
}
```

- [ ] **Step 3: Create `js/lightbox.js`** by porting the detail-modal logic from `dndtimeline/docs/app.js`

Port verbatim the `lightbox` DOM creation, `openDetail`/`closeDetail`, the `CALENDAR_ICON` constant, and the `el()` helper. Export `openDetail`, `closeDetail`, `el`, `CALENDAR_ICON`. The only change vs the original: `openDetail(ev)` reads `ev.imageUrl` (a URL string) instead of `ev.image`.

```js
// js/lightbox.js  (structure; body ported from dndtimeline/docs/app.js)
export function el(tag, cls, html) { /* identical to app.js */ }
export const CALENDAR_ICON = `...`; // identical to app.js
// build lightbox element once, define openDetail(ev)/closeDetail() as in app.js,
// using ev.imageUrl in place of ev.image. Export openDetail, closeDetail.
```

- [ ] **Step 4: Create `js/render.js`** by porting the card/row rendering from `dndtimeline/docs/app.js`

Port the per-event rendering (date column, node/diamond, card, mobile `card-meta` pill, image bg+scrim, inner icon+text, click→`openDetail`, scroll-to-top). Changes vs original:
- Take `events` (already sorted) and compute labels via `dates.js` (`yearLabel`, `relativeLabel`, `dateText`) instead of precomputed fields.
- Use `ev.imageUrl` (URL) for the background and lightbox.
- Track `prevMin`/`prevYear` across the loop to decide the year label visibility (show year when it differs from the previous event's year) and the relative label.

```js
// js/render.js
import { el, openDetail, CALENDAR_ICON } from "./lightbox.js";
import { yearLabel, dateText, relativeLabel, minutesToYMD } from "./dates.js";

export function renderTimeline(container, events) {
  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  let prevMin = null, prevYear = null;
  for (const ev of events) {
    const { year } = minutesToYMD(ev.start_minutes);
    const showYear = prevYear === null || year !== prevYear;
    const rel = relativeLabel(prevMin, ev.start_minutes);
    // ... build .row / .date-col / .node / .card exactly as app.js did,
    // using showYear ? yearLabel(year) : "", rel, dateText(ev.start_minutes),
    // ev.color, ev.imageUrl; card click → openDetail({ ...ev, dateText: dateText(ev.start_minutes) }).
    prevMin = ev.start_minutes; prevYear = year;
    frag.appendChild(row);
  }
  container.appendChild(frag);
  // terminal node + scroll-to-top button: ported from app.js
}
```

- [ ] **Step 5: Create `js/sample-data.js`** (temporary) by converting the original export to the new shape

```bash
cd /Users/metinu/git/dndtimeline-editor
python3 - <<'PY'
import json
src="/Users/metinu/git/dndtimeline/Tierras perdidas, sueños encontrados.json"
ev=json.load(open(src))["resources"][0]["documents"][0]["content"]["events"]
out=[{"id":e["id"],"name":e["name"],"color":e.get("color","#0079CC"),
      "start_minutes":e["start"],"imageUrl":None} for e in sorted(ev,key=lambda e:e["start"])]
open("js/sample-data.js","w",encoding="utf-8").write(
  "export const SAMPLE_EVENTS = "+json.dumps(out,ensure_ascii=False,indent=2)+";\n")
print("wrote",len(out),"events")
PY
```

- [ ] **Step 6: Create `js/main.js`** (sample source for now)

```js
// js/main.js
import { renderTimeline } from "./render.js";
import { SAMPLE_EVENTS } from "./sample-data.js";

const container = document.getElementById("chronicle");
renderTimeline(container, SAMPLE_EVENTS);
```

- [ ] **Step 7: Create `index.html`** (copy of dndtimeline's, with module entry)

Copy `dndtimeline/docs/index.html`, keep the `<head>` (fonts + `styles.css` + `theme-arcane.css`), keep the body markup down to `<div class="chronicle" id="chronicle">`. Replace the two trailing `<script src="data.js">`/`<script src="app.js">` tags with a single `<script type="module" src="js/main.js"></script>`.

- [ ] **Step 8: Verify it renders like the original**

```bash
cd /Users/metinu/git/dndtimeline-editor
python3 -m http.server 8744 >/tmp/edsrv.log 2>&1 &
sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=1280,900 --virtual-time-budget=4000 --screenshot=/tmp/ed_task1.png "http://localhost:8744/" >/dev/null 2>&1
```
Expected: PASS — `/tmp/ed_task1.png` shows the arcane timeline (gold title, diamonds, cards) identical to the current site, rendered from `sample-data.js`. Read the screenshot to confirm.

- [ ] **Step 9: Commit**

```bash
cd /Users/metinu/git/dndtimeline-editor
git add -A
git commit -m "scaffold editor repo: static viewer refactored into ES modules"
```

---

### Task 2: Date logic with unit tests (`js/dates.js`)

Lock down the pure date/label functions with node tests against known cases, including BCE.

**Files:**
- Modify: `/Users/metinu/git/dndtimeline-editor/js/dates.js` (already created in Task 1)
- Create: `/Users/metinu/git/dndtimeline-editor/tests/dates.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (final signatures, used by `render.js`, `edit.js`, `migrate.py` parity):
  - `minutesToYMD(min: number) -> { year, month, day }` (year ≤ 0 means BCE; year is astronomical, e.g. 0 = 1 BCE)
  - `ymdToMinutes(year, month, day) -> number`
  - `yearLabel(year: number) -> string` (`"1475 CE"` / `"1499 BCE"`)
  - `dateText(min: number) -> string`
  - `relativeLabel(prevMin: number|null, curMin: number) -> string`

- [ ] **Step 1: Write the failing tests**

```js
// tests/dates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { minutesToYMD, ymdToMinutes, yearLabel, dateText, relativeLabel } from "../js/dates.js";

test("minutesToYMD matches known LegendKeeper anchors", () => {
  assert.deepEqual(minutesToYMD(774722880), { year: 1474, month: 1, day: 1 });
  assert.deepEqual(minutesToYMD(775248480), { year: 1475, month: 1, day: 1 });
  assert.deepEqual(minutesToYMD(775482109), { year: 1475, month: 6, day: 12 });
});

test("BCE minutes resolve to non-positive years", () => {
  assert.equal(minutesToYMD(-788397513).year <= 0, true);
});

test("ymdToMinutes is the inverse for CE dates", () => {
  assert.equal(minutesToYMD(ymdToMinutes(1475, 6, 12)).year, 1475);
  assert.equal(minutesToYMD(ymdToMinutes(1475, 6, 12)).month, 6);
  assert.equal(minutesToYMD(ymdToMinutes(1475, 6, 12)).day, 12);
});

test("yearLabel formats CE and BCE", () => {
  assert.equal(yearLabel(1475), "1475 CE");
  assert.equal(yearLabel(0), "1 BCE");
  assert.equal(yearLabel(-1498), "1499 BCE");
});

test("relativeLabel: years vs days vs none", () => {
  assert.equal(relativeLabel(null, 100), "");
  assert.equal(relativeLabel(774722880, 775248480), "1 year later"); // 1474-01-01 → 1475-01-01
  assert.equal(relativeLabel(775248480, 775482109), "162 days later"); // 1475-01-01 → 1475-06-12
});
```

- [ ] **Step 2: Run the tests to verify they fail (if dates.js is incomplete) or pass (stub already correct)**

```bash
cd /Users/metinu/git/dndtimeline-editor
node --test tests/
```
Expected: tests run. If any FAIL, fix `js/dates.js` in Step 3. (The Task 1 stub should already pass; this task formalizes and guards it.)

- [ ] **Step 3: Make any fixes in `js/dates.js`** so all assertions pass (the stub from Task 1 is the reference implementation; adjust only if a test fails).

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/metinu/git/dndtimeline-editor
node --test tests/
```
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add js/dates.js tests/dates.test.mjs
git commit -m "test: lock down date math and label formatting (incl. BCE)"
```

---

### Task 3: Create the Supabase project and schema (table + RLS + storage)

Provision the backend. **Requires `SUPABASE_PAT`.**

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/supabase/schema.sql`
- Create: `/Users/metinu/git/dndtimeline-editor/.env.example`

**Interfaces:**
- Produces (written to a local, git-ignored `.env`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`.

- [ ] **Step 1: Write `supabase/schema.sql`** (idempotent DDL: table, RLS, storage bucket + policies)

```sql
-- supabase/schema.sql
create extension if not exists "pgcrypto";

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  start_minutes bigint not null,
  color        text not null default '#0079CC',
  image_path   text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.events enable row level security;

drop policy if exists events_read_public on public.events;
create policy events_read_public on public.events
  for select to anon, authenticated using (true);

drop policy if exists events_write_auth on public.events;
create policy events_write_auth on public.events
  for all to authenticated using (true) with check (true);

-- storage bucket for images (public read)
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists images_read_public on storage.objects;
create policy images_read_public on storage.objects
  for select to anon, authenticated using (bucket_id = 'event-images');

drop policy if exists images_write_auth on storage.objects;
create policy images_write_auth on storage.objects
  for all to authenticated using (bucket_id = 'event-images') with check (bucket_id = 'event-images');
```

- [ ] **Step 2: Write `.env.example`**

```bash
# .env.example  (copy to .env and fill; .env is git-ignored)
SUPABASE_PAT=           # Personal Access Token (local only; revoke after setup)
SUPABASE_PROJECT_REF=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE=
SUPABASE_DB_URL=
SHARED_EDITOR_EMAIL=campaign@example.com
SHARED_EDITOR_PASSWORD=   # the campaign password (local only)
```

- [ ] **Step 3: Create the project via the Management API**

```bash
cd /Users/metinu/git/dndtimeline-editor
ORG=$(curl -s -H "Authorization: Bearer $SUPABASE_PAT" https://api.supabase.com/v1/organizations | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
DBPASS=$(python3 -c "import secrets;print(secrets.token_urlsafe(24))")
curl -s -X POST https://api.supabase.com/v1/projects \
  -H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json" \
  -d "{\"organization_id\":\"$ORG\",\"name\":\"dndtimeline\",\"region\":\"eu-west-1\",\"db_pass\":\"$DBPASS\"}" \
  | tee /tmp/sb_project.json
echo "DB password (save to .env mentally): $DBPASS"
```
Expected: JSON with a project `id` (the project ref). Note the ref. Project provisioning takes ~1–2 min.

- [ ] **Step 4: Fetch keys and assemble `.env`** (poll until the project is ACTIVE_HEALTHY)

```bash
REF=$(python3 -c "import json;print(json.load(open('/tmp/sb_project.json'))['id'])")
# wait for active
until [ "$(curl -s -H "Authorization: Bearer $SUPABASE_PAT" https://api.supabase.com/v1/projects/$REF | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status",""))')" = "ACTIVE_HEALTHY" ]; do sleep 10; done
KEYS=$(curl -s -H "Authorization: Bearer $SUPABASE_PAT" https://api.supabase.com/v1/projects/$REF/api-keys)
ANON=$(echo "$KEYS" | python3 -c "import sys,json;print([k['api_key'] for k in json.load(sys.stdin) if k['name']=='anon'][0])")
SERVICE=$(echo "$KEYS" | python3 -c "import sys,json;print([k['api_key'] for k in json.load(sys.stdin) if k['name']=='service_role'][0])")
# DB connection string uses the pooler host; build it:
echo "REF=$REF ; set SUPABASE_DB_URL using the db password from Step 3"
```
Write the values into `.env`: `SUPABASE_PROJECT_REF`, `SUPABASE_URL=https://$REF.supabase.co`, `SUPABASE_ANON_KEY=$ANON`, `SUPABASE_SERVICE_ROLE=$SERVICE`, and `SUPABASE_DB_URL=postgresql://postgres.$REF:$DBPASS@aws-0-eu-west-1.pooler.supabase.com:5432/postgres` (use the project's actual pooler host shown in the dashboard if different).

- [ ] **Step 5: Apply the schema**

```bash
cd /Users/metinu/git/dndtimeline-editor
set -a; . ./.env; set +a
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```
Expected: `CREATE TABLE`, `CREATE POLICY`, `INSERT 0 1` (bucket), etc., no errors.

- [ ] **Step 6: Verify RLS (public read works, anon write is blocked)**

```bash
set -a; . ./.env; set +a
# read as anon → empty array (200)
curl -s "$SUPABASE_URL/rest/v1/events?select=*" -H "apikey: $SUPABASE_ANON_KEY" ; echo
# insert as anon → should be rejected by RLS
curl -s -X POST "$SUPABASE_URL/rest/v1/events" -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"name":"x","start_minutes":0}' ; echo
```
Expected: first returns `[]`; second returns a permission/row-level-security error (NOT a created row).

- [ ] **Step 7: Commit** (schema + example env only; never the real `.env`)

```bash
git add supabase/schema.sql .env.example
git commit -m "feat: supabase schema (events table, RLS, public image bucket)"
```

---

### Task 4: Create the shared "campaign editor" account

One auth user whose password is the shared campaign password.

**Files:** none (uses `.env`).

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SHARED_EDITOR_EMAIL`, `SHARED_EDITOR_PASSWORD` from `.env`.
- Produces: a confirmed auth user usable via `signInWithPassword`.

- [ ] **Step 1: Choose the email + password** and set `SHARED_EDITOR_EMAIL` / `SHARED_EDITOR_PASSWORD` in `.env`. (Ask the user for the desired campaign password; default email `campaign@<anything>.com`.)

- [ ] **Step 2: Create the user (email pre-confirmed) via the Admin API**

```bash
cd /Users/metinu/git/dndtimeline-editor
set -a; . ./.env; set +a
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SHARED_EDITOR_EMAIL\",\"password\":\"$SHARED_EDITOR_PASSWORD\",\"email_confirm\":true}" | tee /tmp/sb_user.json
```
Expected: JSON with the new user's `id` and the email.

- [ ] **Step 3: Verify login works**

```bash
set -a; . ./.env; set +a
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SHARED_EDITOR_EMAIL\",\"password\":\"$SHARED_EDITOR_PASSWORD\"}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('OK' if d.get('access_token') else d)"
```
Expected: prints `OK`.

- [ ] **Step 4: (No commit — no files changed.)** Record the email in `js/config.js` in Task 5.

---

### Task 5: Wire the front-end read path to Supabase

Replace the sample data source with a live Supabase query.

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/js/config.js`
- Create: `/Users/metinu/git/dndtimeline-editor/js/supabaseClient.js`
- Modify: `/Users/metinu/git/dndtimeline-editor/js/main.js`
- Delete: `/Users/metinu/git/dndtimeline-editor/js/sample-data.js`

**Interfaces:**
- Produces: `supabase` (client) from `supabaseClient.js`; `fetchEvents() -> Promise<event[]>` from `main.js` (event shape includes `imageUrl` resolved from `image_path` via the public bucket URL).

- [ ] **Step 1: Write `js/config.js`** with PUBLIC values (safe to commit) — fill from `.env`

```js
// js/config.js  (PUBLIC values only — safe to commit)
export const SUPABASE_URL = "https://REPLACE_REF.supabase.co";
export const SUPABASE_ANON_KEY = "REPLACE_ANON_KEY";
export const SHARED_EDITOR_EMAIL = "campaign@example.com";
export const IMAGE_BUCKET = "event-images";
```

- [ ] **Step 2: Write `js/supabaseClient.js`**

```js
// js/supabaseClient.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 3: Rewrite `js/main.js`** to fetch from Supabase and map `image_path → imageUrl`

```js
// js/main.js
import { supabase } from "./supabaseClient.js";
import { SUPABASE_URL, IMAGE_BUCKET } from "./config.js";
import { renderTimeline } from "./render.js";

function imageUrl(path) {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}` : null;
}

export async function fetchEvents() {
  const { data, error } = await supabase
    .from("events").select("*").order("start_minutes", { ascending: true });
  if (error) { console.error(error); return []; }
  return data.map(r => ({ ...r, imageUrl: imageUrl(r.image_path) }));
}

const container = document.getElementById("chronicle");
renderTimeline(container, await fetchEvents());
window.__reload = async () => renderTimeline(container, await fetchEvents());
```

- [ ] **Step 4: Remove the sample file and insert one test row** to confirm the live path

```bash
cd /Users/metinu/git/dndtimeline-editor
rm js/sample-data.js
set -a; . ./.env; set +a
curl -s -X POST "$SUPABASE_URL/rest/v1/events" -H "apikey: $SUPABASE_SERVICE_ROLE" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" -H "Content-Type: application/json" \
  -d '{"name":"Evento de prueba","start_minutes":775248480,"color":"#0079CC"}' ; echo
```

- [ ] **Step 5: Verify the page renders the row from Supabase**

```bash
cd /Users/metinu/git/dndtimeline-editor
python3 -m http.server 8744 >/tmp/edsrv.log 2>&1 &
sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=1280,700 --virtual-time-budget=5000 --screenshot=/tmp/ed_task5.png "http://localhost:8744/" >/dev/null 2>&1
```
Expected: PASS — screenshot shows a single card "Evento de prueba" dated 1475 CE, fetched live. Read the screenshot to confirm. Then delete the test row:
```bash
curl -s -X DELETE "$SUPABASE_URL/rest/v1/events?name=eq.Evento%20de%20prueba" -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE"
```

- [ ] **Step 6: Commit** (config.js holds only public anon key + url)

```bash
git add js/config.js js/supabaseClient.js js/main.js
git rm --cached js/sample-data.js 2>/dev/null; true
git commit -m "feat: read events live from Supabase"
```

---

### Task 6: Migrate the existing 55 events + 31 images

One-time load of the real campaign data.

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/scripts/migrate.py`
- Create (input copy): `/Users/metinu/git/dndtimeline-editor/data/source-export.json` (copy of the original; large file)

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` from env; the source JSON.
- Produces: rows in `events` + objects in `event-images` with matching `image_path`.

- [ ] **Step 1: Copy the source export into the repo** (so migration is reproducible)

```bash
mkdir -p /Users/metinu/git/dndtimeline-editor/data
cp "/Users/metinu/git/dndtimeline/Tierras perdidas, sueños encontrados.json" /Users/metinu/git/dndtimeline-editor/data/source-export.json
```

- [ ] **Step 2: Write `scripts/migrate.py`** (stdlib only: `urllib`, `base64`, `json`)

```python
#!/usr/bin/env python3
"""One-time migration: source export -> Supabase events + image uploads."""
import base64, json, os, sys, urllib.request

URL = os.environ["SUPABASE_URL"]; KEY = os.environ["SUPABASE_SERVICE_ROLE"]
SRC = os.path.join(os.path.dirname(__file__), "..", "data", "source-export.json")

def req(method, path, data=None, headers=None, raw=False):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    if headers: h.update(headers)
    body = data if raw else (json.dumps(data).encode() if data is not None else None)
    if not raw and data is not None: h["Content-Type"] = "application/json"
    r = urllib.request.Request(URL + path, data=body, headers=h, method=method)
    with urllib.request.urlopen(r) as resp:
        return resp.status, resp.read()

def main():
    events = json.load(open(SRC, encoding="utf-8"))["resources"][0]["documents"][0]["content"]["events"]
    events = sorted(events, key=lambda e: e["start"])
    for i, e in enumerate(events):
        image_path = None
        uri = e.get("imageUrl", "")
        if uri.startswith("data:"):
            header, b64 = uri.split(",", 1)
            ext = "png" if "png" in header else ("jpg" if ("jpeg" in header or "jpg" in header) else "bin")
            raw = base64.b64decode(b64)
            image_path = f'{e["id"]}.{ext}'
            ctype = "image/png" if ext == "png" else "image/jpeg"
            req("POST", f"/storage/v1/object/event-images/{image_path}", data=raw, raw=True,
                headers={"Content-Type": ctype, "x-upsert": "true"})
        row = {"name": e["name"], "start_minutes": e["start"],
               "color": e.get("color", "#0079CC"), "image_path": image_path, "sort_order": i}
        req("POST", "/rest/v1/events", data=row, headers={"Prefer": "return=minimal"})
        print(f'[{i+1}/{len(events)}] {e["name"][:40]}' + (" (img)" if image_path else ""))
    print("done")

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the migration**

```bash
cd /Users/metinu/git/dndtimeline-editor
set -a; . ./.env; set +a
python3 scripts/migrate.py
```
Expected: prints 55 lines (one per event), ~31 marked `(img)`, then `done`.

- [ ] **Step 4: Verify counts**

```bash
set -a; . ./.env; set +a
curl -s "$SUPABASE_URL/rest/v1/events?select=id" -H "apikey: $SUPABASE_SERVICE_ROLE" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE" -H "Prefer: count=exact" -I 2>/dev/null | grep -i content-range
```
Expected: a `content-range` header ending in `/55`. Then load the site (as in Task 5 Step 5) and confirm the full arcane timeline with images appears.

- [ ] **Step 5: Commit** (migration script + source copy)

```bash
git add scripts/migrate.py data/source-export.json
git commit -m "feat: one-time migration of existing events and images into Supabase"
```

---

### Task 7: Lock entry + shared-password login (`js/edit.js` — auth half)

Add the discreet lock and the login that flips the page into edit mode.

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/js/edit.js`
- Modify: `/Users/metinu/git/dndtimeline-editor/js/main.js` (initialize edit module)
- Modify: `/Users/metinu/git/dndtimeline-editor/index.html` (footer lock button container)
- Modify: `/Users/metinu/git/dndtimeline-editor/styles.css` (lock + login + edit-affordance styles)

**Interfaces:**
- Consumes: `supabase` from `supabaseClient.js`; `SHARED_EDITOR_EMAIL` from `config.js`; `window.__reload`.
- Produces: `initEditing({ onModeChange })` from `edit.js`; toggles `document.body.classList` `edit-mode`.

- [ ] **Step 1: Add a discreet lock button to the footer in `index.html`**

```html
<!-- inside the footer -->
<button id="lock-btn" class="lock-btn" title="Editar" aria-label="Editar">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
</button>
```

- [ ] **Step 2: Add styles** for `.lock-btn` (muted, small, corner), `.login-modal`, and edit affordances hidden unless `body.edit-mode`

```css
/* styles.css (append) */
.lock-btn { opacity: .35; background: none; border: none; color: var(--muted); cursor: pointer; padding: 6px; }
.lock-btn:hover { opacity: 1; }
.login-modal { position: fixed; inset: 0; z-index: 1100; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.7); }
.login-modal.open { display: flex; }
.login-card { background: var(--canvas); border: 1px solid var(--border); border-radius: 14px; padding: 20px; width: min(92vw, 340px); display: flex; flex-direction: column; gap: 10px; }
.login-card input { padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: #0c0a12; color: var(--fg); }
.login-card .err { color: #f87171; font-size: 12px; min-height: 14px; }
.edit-only { display: none; }
body.edit-mode .edit-only { display: inline-flex; }
```

- [ ] **Step 3: Write `js/edit.js`** (auth half: login modal, sign-in, sign-out, mode toggle)

```js
// js/edit.js
import { supabase } from "./supabaseClient.js";
import { SHARED_EDITOR_EMAIL } from "./config.js";

let onMode = () => {};

function setMode(on) { document.body.classList.toggle("edit-mode", on); onMode(on); }

function buildLoginModal() {
  const m = document.createElement("div");
  m.className = "login-modal";
  m.innerHTML = `<div class="login-card">
    <strong>Editar la cronología</strong>
    <input id="login-pass" type="password" placeholder="Contraseña de campaña" autocomplete="current-password"/>
    <div class="err" id="login-err"></div>
    <button id="login-go">Entrar</button></div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); });
  m.querySelector("#login-go").addEventListener("click", async () => {
    const pass = m.querySelector("#login-pass").value;
    const { error } = await supabase.auth.signInWithPassword({ email: SHARED_EDITOR_EMAIL, password: pass });
    if (error) { m.querySelector("#login-err").textContent = "Contraseña incorrecta"; return; }
    m.classList.remove("open"); setMode(true);
  });
  return m;
}

export async function initEditing({ onModeChange } = {}) {
  onMode = onModeChange || (() => {});
  const modal = buildLoginModal();
  document.getElementById("lock-btn").addEventListener("click", () => {
    if (document.body.classList.contains("edit-mode")) { supabase.auth.signOut(); setMode(false); }
    else modal.classList.add("open");
  });
  window.addEventListener("hashchange", () => { if (location.hash === "#editar") modal.classList.add("open"); });
  if (location.hash === "#editar") modal.classList.add("open");
  const { data } = await supabase.auth.getSession();
  if (data.session) setMode(true);   // restore prior session on this device
}
```

- [ ] **Step 4: Initialize from `main.js`**

```js
// append to js/main.js
import { initEditing } from "./edit.js";
await initEditing({ onModeChange: () => window.__reload() });
```

- [ ] **Step 5: Verify lock → wrong/right password**

```bash
cd /Users/metinu/git/dndtimeline-editor
python3 -m http.server 8744 >/tmp/edsrv.log 2>&1 &
sleep 1
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --window-size=420,800 --virtual-time-budget=4000 --screenshot=/tmp/ed_task7.png "http://localhost:8744/#editar" >/dev/null 2>&1
```
Expected: PASS — screenshot shows the login modal. (Manual follow-up by the user: real password unlocks edit mode; wrong shows "Contraseña incorrecta".) Read the screenshot to confirm the modal renders.

- [ ] **Step 6: Commit**

```bash
git add js/edit.js js/main.js index.html styles.css
git commit -m "feat: discreet lock + shared-password login toggles edit mode"
```

---

### Task 8: Add / edit / delete events (`js/edit.js` — CRUD half)

Edit affordances on cards and an event form.

**Files:**
- Modify: `/Users/metinu/git/dndtimeline-editor/js/edit.js`
- Modify: `/Users/metinu/git/dndtimeline-editor/js/render.js` (emit per-card edit/delete buttons + an add button, shown only in edit mode)
- Modify: `/Users/metinu/git/dndtimeline-editor/styles.css` (form modal + card buttons)

**Interfaces:**
- Consumes: `supabase`, `ymdToMinutes`/`minutesToYMD` from `dates.js`, `window.__reload`.
- Produces: `openEventForm(event|null)` from `edit.js`; `saveEvent`, `deleteEvent` helpers.

- [ ] **Step 1: In `render.js`, add edit-mode controls** (a pencil + trash per card, and one "+" add button), each wrapped so CSS `.edit-only` hides them outside edit mode. Wire pencil → `window.__openEventForm(ev)`, trash → `window.__deleteEvent(ev)`, add → `window.__openEventForm(null)`.

```js
// in render.js, inside the card build, after .inner:
const tools = el("div", "card-tools edit-only");
tools.innerHTML = `<button class="t-edit" title="Editar">✎</button><button class="t-del" title="Borrar">🗑</button>`;
tools.querySelector(".t-edit").addEventListener("click", (e)=>{ e.stopPropagation(); window.__openEventForm(ev); });
tools.querySelector(".t-del").addEventListener("click", (e)=>{ e.stopPropagation(); window.__deleteEvent(ev); });
card.appendChild(tools);
// after building all rows, append a floating add button:
const add = el("button", "add-btn edit-only", "+");
add.addEventListener("click", ()=>window.__openEventForm(null));
container.appendChild(add);
```

- [ ] **Step 2: Add styles** for `.card-tools`, `.add-btn`, `.event-form-modal` (reuse `.login-card` look)

```css
/* styles.css (append) */
.card-tools { position:absolute; top:10px; right:12px; z-index:5; gap:6px; }
.card-tools button { background: rgba(0,0,0,.5); color:#fff; border:none; border-radius:8px; padding:4px 8px; cursor:pointer; }
.add-btn { position: fixed; right: 18px; bottom: 70px; z-index: 900; width: 52px; height: 52px; border-radius: 50%; font-size: 26px; border: 1px solid var(--border); background: var(--gold, #d9b25f); color:#1a1407; cursor:pointer; }
.event-form-modal { position: fixed; inset:0; z-index:1100; display:none; align-items:center; justify-content:center; background: rgba(0,0,0,.7); }
.event-form-modal.open { display:flex; }
.event-form { background: var(--canvas); border:1px solid var(--border); border-radius:14px; padding:20px; width:min(94vw,420px); display:flex; flex-direction:column; gap:10px; }
.event-form input, .event-form label { color: var(--fg); }
.event-form .row2 { display:flex; gap:8px; }
```

- [ ] **Step 3: Add the event form + CRUD to `edit.js`**

```js
// js/edit.js (append)
import { ymdToMinutes, minutesToYMD } from "./dates.js";

function buildEventForm() {
  const m = document.createElement("div");
  m.className = "event-form-modal";
  m.innerHTML = `<div class="event-form">
    <strong id="ef-title">Nuevo evento</strong>
    <input id="ef-name" type="text" placeholder="Nombre del evento"/>
    <label>Fecha <input id="ef-date" type="date"/></label>
    <label><input id="ef-bce" type="checkbox"/> Antes de Cristo (BCE)</label>
    <div class="row2"><input id="ef-color" type="color" value="#0079CC"/>
      <input id="ef-img" type="file" accept="image/*"/></div>
    <div class="err" id="ef-err"></div>
    <div class="row2"><button id="ef-save">Guardar</button><button id="ef-cancel">Cancelar</button></div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener("click", e => { if (e.target === m) m.classList.remove("open"); });
  m.querySelector("#ef-cancel").addEventListener("click", () => m.classList.remove("open"));
  return m;
}

let formEl, editingId = null, uploadImage = async () => null;

function startMinutesFromForm(m) {
  const v = m.querySelector("#ef-date").value;            // "YYYY-MM-DD"
  const [y, mo, d] = v.split("-").map(Number);
  const year = m.querySelector("#ef-bce").checked ? 1 - y : y; // BCE → astronomical
  return ymdToMinutes(year, mo, d);
}

export function wireCrud(supabase) {
  formEl = buildEventForm();
  window.__openEventForm = (ev) => {
    editingId = ev?.id ?? null;
    formEl.querySelector("#ef-title").textContent = ev ? "Editar evento" : "Nuevo evento";
    formEl.querySelector("#ef-name").value = ev?.name ?? "";
    formEl.querySelector("#ef-color").value = ev?.color ?? "#0079CC";
    formEl.querySelector("#ef-err").textContent = "";
    formEl.querySelector("#ef-img").value = "";
    if (ev) {
      const { year, month, day } = minutesToYMD(ev.start_minutes);
      const bce = year <= 0;
      formEl.querySelector("#ef-bce").checked = bce;
      const yy = String(bce ? 1 - year : year).padStart(4, "0");
      formEl.querySelector("#ef-date").value = `${yy}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    } else { formEl.querySelector("#ef-date").value = ""; formEl.querySelector("#ef-bce").checked = false; }
    formEl.classList.add("open");
  };
  window.__deleteEvent = async (ev) => {
    if (!confirm(`¿Borrar "${ev.name}"?`)) return;
    await supabase.from("events").delete().eq("id", ev.id);
    window.__reload();
  };
  formEl.querySelector("#ef-save").addEventListener("click", async () => {
    try {
      const name = formEl.querySelector("#ef-name").value.trim();
      const start_minutes = startMinutesFromForm(formEl);
      const color = formEl.querySelector("#ef-color").value;
      const file = formEl.querySelector("#ef-img").files[0];
      let image_path; const has_image_field = !!file;
      if (file) image_path = await uploadImage(file);     // defined in Task 9
      const payload = { name, start_minutes, color };
      if (has_image_field) payload.image_path = image_path;
      if (editingId) await supabase.from("events").update(payload).eq("id", editingId);
      else await supabase.from("events").insert(payload);
      formEl.classList.remove("open"); window.__reload();
    } catch (e) { formEl.querySelector("#ef-err").textContent = String(e.message || e); }
  });
}
export function setUploader(fn) { uploadImage = fn; }
```

- [ ] **Step 4: Call `wireCrud(supabase)` from `initEditing`** (add `import { wireCrud } ...` is same file; just call it at the end of `initEditing`). Add `wireCrud(supabase);` before the session check.

- [ ] **Step 5: Verify CRUD round-trip** (manual, with the real password — document expected outcome)

Start the server, unlock with the password, then:
- Click "+", fill name "Prueba CRUD", pick a date, Save → a new card appears at the right position.
- Click its pencil, change the name, Save → card updates.
- Click its trash, confirm → card disappears.

Expected: PASS — each action reflects after `window.__reload()`. (Image field covered in Task 9.)

- [ ] **Step 6: Commit**

```bash
git add js/edit.js js/render.js styles.css
git commit -m "feat: add/edit/delete events in edit mode"
```

---

### Task 9: Image upload from device (client resize → Storage)

Uploading a photo from the phone, resized client-side, into the bucket.

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/js/imageUpload.js`
- Modify: `/Users/metinu/git/dndtimeline-editor/js/edit.js` (use the uploader)
- Modify: `/Users/metinu/git/dndtimeline-editor/js/main.js` (wire uploader into edit)

**Interfaces:**
- Consumes: `supabase`, `IMAGE_BUCKET`.
- Produces: `uploadResizedImage(file) -> Promise<string image_path>` from `imageUpload.js`.

- [ ] **Step 1: Write `js/imageUpload.js`** (canvas resize to ≤1200px WebP, upload, return path)

```js
// js/imageUpload.js
import { supabase } from "./supabaseClient.js";
import { IMAGE_BUCKET } from "./config.js";

function resize(file, max = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/webp", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadResizedImage(file) {
  const blob = await resize(file);
  const path = `${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: "image/webp", upsert: false,
  });
  if (error) throw error;
  return path;
}
```

- [ ] **Step 2: Wire the uploader into `edit.js`** via `setUploader` from `main.js`

```js
// append to js/main.js (before initEditing or after import)
import { setUploader } from "./edit.js";
import { uploadResizedImage } from "./imageUpload.js";
setUploader(uploadResizedImage);
```

- [ ] **Step 3: Verify upload** (manual, with password)

Unlock, "+"/edit an event, choose a photo from the device, Save. Expected: PASS — the card shows the photo as background, and clicking it opens the full image in the lightbox; reloading the page still shows it (served from the public bucket URL).

- [ ] **Step 4: Commit**

```bash
git add js/imageUpload.js js/edit.js js/main.js
git commit -m "feat: upload resized images from device to Supabase Storage"
```

---

### Task 10: Weekly keep-alive + durable backup (GitHub Action)

Prevent the free-tier 7-day pause and snapshot the data into the repo.

**Files:**
- Create: `/Users/metinu/git/dndtimeline-editor/scripts/backup.py`
- Create: `/Users/metinu/git/dndtimeline-editor/.github/workflows/keepalive-backup.yml`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (read-only) from env/secrets.
- Produces: `backup/events.json` + `backup/images/*` committed by the workflow.

- [ ] **Step 1: Write `scripts/backup.py`** (stdlib only)

```python
#!/usr/bin/env python3
"""Dump events + images from Supabase into backup/ (also acts as a read ping)."""
import json, os, urllib.request

URL = os.environ["SUPABASE_URL"]; KEY = os.environ["SUPABASE_ANON_KEY"]
OUT = os.path.join(os.path.dirname(__file__), "..", "backup")

def get(path):
    r = urllib.request.Request(URL + path, headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(r) as resp:
        return resp.read()

def main():
    os.makedirs(os.path.join(OUT, "images"), exist_ok=True)
    rows = json.loads(get("/rest/v1/events?select=*&order=start_minutes.asc"))
    json.dump(rows, open(os.path.join(OUT, "events.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    for r in rows:
        p = r.get("image_path")
        if not p: continue
        data = get(f"/storage/v1/object/public/event-images/{p}")
        open(os.path.join(OUT, "images", p), "wb").write(data)
    print(f"backed up {len(rows)} events")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the workflow**

```yaml
# .github/workflows/keepalive-backup.yml
name: Keep-alive & backup
on:
  schedule: [{ cron: "0 6 * * 1" }]   # Mondays 06:00 UTC
  workflow_dispatch:
permissions:
  contents: write
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Backup from Supabase
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: python3 scripts/backup.py
      - name: Commit snapshot
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add backup
          git diff --cached --quiet || git commit -m "chore: weekly timeline backup"
          git push
```

- [ ] **Step 3: Verify backup locally**

```bash
cd /Users/metinu/git/dndtimeline-editor
set -a; . ./.env; set +a
python3 scripts/backup.py
ls backup && ls backup/images | head
```
Expected: `backup/events.json` with 55 rows and `backup/images/` populated; prints `backed up 55 events`.

- [ ] **Step 4: Commit** (script + workflow + first snapshot)

```bash
git add scripts/backup.py .github/workflows/keepalive-backup.yml backup
git commit -m "feat: weekly keep-alive + durable backup to repo"
```

---

### Task 11: Publish to GitHub Pages + secrets + final verification

Ship it and lock in the live verification.

**Files:** none (repo settings + secrets).

- [ ] **Step 1: Create the GitHub repo and push**

```bash
cd /Users/metinu/git/dndtimeline-editor
gh repo create dndtimeline-editor --public --source=. --remote=origin --push
git config http.postBuffer 524288000   # source-export.json is large
git push -u origin main
```

- [ ] **Step 2: Add Action secrets** (read-only anon values; safe, but kept as secrets for tidiness)

```bash
set -a; . ./.env; set +a
gh secret set SUPABASE_URL --body "$SUPABASE_URL"
gh secret set SUPABASE_ANON_KEY --body "$SUPABASE_ANON_KEY"
```

- [ ] **Step 3: Enable Pages from `main` root**

```bash
gh api -X POST repos/$(gh api user -q .login)/dndtimeline-editor/pages -f "source[branch]=main" -f "source[path]=/" || \
gh api repos/$(gh api user -q .login)/dndtimeline-editor/pages
```

- [ ] **Step 4: Final live verification**

```bash
USER=$(gh api user -q .login)
URL="https://$USER.github.io/dndtimeline-editor/"
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL")" = "200" ]; do sleep 12; done
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=1280,900 --virtual-time-budget=6000 --screenshot=/tmp/ed_live.png "$URL" >/dev/null 2>&1
```
Expected: PASS — live site shows the full arcane timeline (read-only, no edit buttons) with images, served from Supabase. Read `/tmp/ed_live.png`. Confirm the lock icon is present; visiting `#editar` + the password reveals edit controls.

- [ ] **Step 5: Trigger the backup workflow once to confirm CI works**

```bash
gh workflow run "Keep-alive & backup"
gh run watch "$(gh run list --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```
Expected: PASS — run completes; a "weekly timeline backup" commit may appear if data changed.

- [ ] **Step 6: Revoke the Personal Access Token** (security hygiene; project keys remain)

Remind the user to delete the PAT in Supabase → Account → Access Tokens now that setup is done.

---

## Self-Review

**Spec coverage:**
- Read-only default + lock entry → Tasks 7, 1, 11. ✓
- Shared-password-as-single-account → Tasks 4, 7. ✓
- `events` model + JS label computation → Tasks 2, 5 (note: spec §5 `event_date` resolved to `start_minutes` per spec §11 open question; recorded in Global Constraints). ✓
- Image upload from device → Task 9; public bucket → Task 3. ✓
- Live read from Supabase → Task 5. ✓
- Weekly keep-alive + backup → Task 10. ✓
- Migration of 55 events + 31 images → Task 6. ✓
- New repo, not touching `dndtimeline` → Global Constraints, Task 1, Task 11. ✓
- Setup task division / full-control PAT → Prerequisites, Tasks 3–4, Task 11 Step 6. ✓
- Async / last-write-wins, singleton → Global Constraints. ✓

**Placeholder scan:** No "TBD/TODO". The two "ported from app.js" steps (lightbox, render) reference an existing concrete file in the `dndtimeline` repo and give the exact adaptation (use `imageUrl`, compute labels via `dates.js`); the porting source is real code, not a placeholder. Schema, auth, CRUD, image upload, migration, and backup steps contain complete code.

**Type consistency:** Event shape `{ id, name, color, start_minutes, image_path?, imageUrl }` is consistent across `render.js`, `main.js`, `edit.js`, `migrate.py`, `backup.py`. `dates.js` exports (`minutesToYMD`, `ymdToMinutes`, `yearLabel`, `dateText`, `relativeLabel`) are used with matching signatures in Tasks 1, 2, 5, 8. `uploadResizedImage` (Task 9) matches `setUploader`/`uploadImage` usage in Task 8.

**Note on TDD:** Only `dates.js` is cleanly unit-testable and uses real node tests (Task 2). Infra/UI tasks use verification steps (curl/headless screenshot/manual) as their test cycle, matching a project with no test harness.
