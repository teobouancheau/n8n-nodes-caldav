# n8n-nodes-caldav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 package defined in `docs/PRD.md`: a programmatic CalDav action node (Calendar/Event/Task resources), a CalDavTrigger polling node, and three credential types, on the tsdav + ical.js + ical-generator stack.

**Architecture:** All protocol/parsing/sync logic lives in `shared/` as pure, unit-tested modules; the two `*.node.ts` files contain only UI descriptions and dispatch. Change detection is sync-token → ctag+etag-diff → full resync. Recurrence expansion is client-side (ical.js), never server `expand`.

**Tech Stack:** TypeScript strict (CommonJS, target es2019), n8n-workflow (peer), tsdav, ical.js, ical-generator, luxon, vitest for unit tests, `@n8n/node-cli` for lint/build if scaffold permits, docker-compose Radicale harness for integration tests.

## Global Constraints (from PRD)

- Node.js >= 22; TS strict; no `any`, no `as` casts to silence errors
- package.json: `n8n` block registering credentials/nodes from `dist`, keyword `n8n-community-node-package`, `files: ["dist"]`, `peerDependencies: { "n8n-workflow": "*" }`, MIT license
- Runtime deps ONLY: tsdav, ical.js, ical-generator, luxon
- English-only UI text; no emojis; conventional commits; no AI attribution in commits
- Empty result sets return empty arrays — never throw
- Every write op supports ETag `If-Match`; UID and unknown ICS properties survive update round-trips
- Task (VTODO) operations gated per collection by `supported-calendar-component-set`
- Credentials never logged; HTTPS default with explicit opt-in `allowHttp` flag
- Attendee side-effect warning text on Event Create/Update UI (RFC 6638 implicit scheduling)

---

### Task 1: Scaffold and toolchain

**Files:** Create `package.json`, `tsconfig.json`, `.gitignore`, `.editorconfig`, `eslint.config.mjs`, `vitest.config.ts`, `README.md` (stub), `LICENSE` (MIT)

Try `npm create @n8n/node@latest` non-interactively first; if it demands interaction, hand-scaffold per the official starter (verified layout in PRD §7.4). Test dirs: co-located `__tests__` next to shared modules. Verify: `npm run build` produces `dist/`, `npx vitest run` passes with a placeholder test, commit `chore: scaffold package`.

### Task 2: Shared types

**Files:** Create `shared/types.ts`

**Produces (consumed by all later tasks):**
```ts
export type CalDavAuthMethod = 'basic' | 'oauth2' | 'token';
export interface CalDavConnection {
  serverUrl: string; authMethod: CalDavAuthMethod; allowHttp: boolean;
  username?: string; password?: string;           // basic
  accessToken?: string;                            // oauth2 (n8n-refreshed)
  headerName?: string; tokenPrefix?: string; token?: string; // token
}
export interface CalendarInfo {
  url: string; displayName: string; color?: string;
  components: string[]; ctag?: string; syncToken?: string;
}
export type EtagMap = Record<string, string>;      // href -> etag
export interface SyncDiff { created: string[]; updated: string[]; deleted: string[]; }
export interface TriggerState {
  syncToken?: string; ctag?: string; etags: EtagMap;
  lastPoll?: string; emittedInstances: string[];   // "<uid>:<recurrenceId|start>:<started|ended>"
}
export interface Attendee { email: string; name?: string; rsvp?: boolean; role?: string; status?: string; }
export interface Alarm { action: 'display' | 'audio' | 'email'; trigger: string; description?: string; }
export interface EventModel {
  uid: string; url?: string; etag?: string; summary: string;
  description?: string; location?: string; eventUrl?: string;
  start: string; end?: string; allDay: boolean; timezone?: string;
  rrule?: string; exdates: string[]; recurrenceId?: string;
  status?: string; transparency?: string; organizer?: string;
  attendees: Attendee[]; alarms: Alarm[]; categories: string[];
  raw: string;                                     // full original ICS for round-trip
}
export interface TaskModel {
  uid: string; url?: string; etag?: string; summary: string;
  description?: string; due?: string; start?: string; timezone?: string;
  priority?: number; status?: string; percentComplete?: number;
  categories: string[]; relatedTo?: string; rrule?: string; raw: string;
}
```
Commit `feat: add shared type models`.

### Task 3: Timezone helper

**Files:** Create `shared/ical/timezone.ts`, `shared/ical/__tests__/timezone.test.ts`

**Produces:** `resolveTimezone(tzid: string | null): string | null` — returns an IANA zone name when `tzid` is already IANA-valid (checked via `Intl.DateTimeFormat` construction) or maps common aliases (e.g. Windows-style names via a small explicit table for the top zones; unknown → null so caller falls back to embedded VTIMEZONE parsing); `toIsoInZone(icalTime, tzid)` — ICAL.Time → ISO 8601 string with correct offset via luxon.

TDD: tests for valid IANA passthrough, invalid zone → null, all-day date handling, DST boundary conversion (`Europe/Paris` spring-forward). Commit `feat: add timezone resolution helper`.

### Task 4: ICS parsing

**Files:** Create `shared/ical/parse.ts`, `shared/ical/__tests__/parse.test.ts`

**Consumes:** Task 2 models, Task 3 helpers.
**Produces:**
```ts
export function parseEvents(ics: string): EventModel[];   // one per VEVENT (incl. RECURRENCE-ID overrides)
export function parseTasks(ics: string): TaskModel[];
```
ical.js based. Tests (fixtures in `shared/ical/__tests__/fixtures/*.ics`): simple event, all-day event, recurring with EXDATE, RECURRENCE-ID override, attendees+alarms, VTODO with due/priority/percent, folded lines, custom X- properties preserved in `raw`, event without DTEND, empty calendar → `[]`. Commit `feat: add ICS parsing`.

### Task 5: ICS building

**Files:** Create `shared/ical/build.ts`, `shared/ical/__tests__/build.test.ts`

**Consumes:** Task 2 models.
**Produces:**
```ts
export function buildEventIcs(event: Omit<EventModel, 'raw' | 'url' | 'etag'>): string;
export function buildTaskIcs(task: Omit<TaskModel, 'raw' | 'url' | 'etag'>): string;
export function applyEventUpdate(existingRaw: string, updates: Partial<EventModel>): string; // mutate via ical.js, preserve unknown props + UID
export function applyTaskUpdate(existingRaw: string, updates: Partial<TaskModel>): string;
```
Create via ical-generator (emits VTIMEZONE); updates via ical.js in-place mutation of the existing component (never rebuild-from-model — this is what guarantees unknown-property survival). Tests: build→parse round-trip equality on all model fields; update preserves X- props and UID; timezone emission; task complete sets STATUS/COMPLETED/PERCENT-COMPLETE. Commit `feat: add ICS generation and round-trip-safe updates`.

### Task 6: Recurrence expansion

**Files:** Create `shared/ical/recurrence.ts`, `shared/ical/__tests__/recurrence.test.ts`

**Consumes:** parse models.
**Produces:**
```ts
export interface ExpandedInstance { start: string; end?: string; recurrenceId: string; master: EventModel; }
export function expandEvent(event: EventModel, windowStart: string, windowEnd: string, overrides?: EventModel[]): ExpandedInstance[];
```
ICAL.RecurExpansion; overrides (RECURRENCE-ID components) replace their instance. Tests: weekly RRULE window, EXDATE excluded, override replaces instance, non-recurring event inside/outside window, DST-crossing daily rule keeps local time, COUNT/UNTIL bounds. Commit `feat: add client-side recurrence expansion`.

### Task 7: Sync diff (pure)

**Files:** Create `shared/sync/diff.ts`, `shared/sync/__tests__/diff.test.ts`

**Produces:**
```ts
export function diffEtagMaps(previous: EtagMap, current: EtagMap): SyncDiff;
export function instanceKey(uid: string, recurrenceIdOrStart: string, kind: 'started' | 'ended'): string;
export function windowEvents(instances: { start: string; end?: string; key: string }[], from: string, to: string, kind: 'started' | 'ended', alreadyEmitted: Set<string>): string[]; // returns keys to emit
```
Tests: created/updated/deleted buckets, no-change → empty, first poll (empty previous) → all created, started/ended window edges inclusive-exclusive, dedupe via alreadyEmitted. Commit `feat: add pure sync diff logic`.

### Task 8: Transport (client factory + discovery + operations)

**Files:** Create `shared/transport/clientFactory.ts`, `shared/transport/discovery.ts`, `shared/transport/calendarOps.ts`, `shared/transport/__tests__/clientFactory.test.ts`

**Consumes:** `CalDavConnection`.
**Produces:**
```ts
export function createClient(conn: CalDavConnection): Promise<DAVClient-like>; // tsdav createDAVClient; token auth via authMethod Custom returning { [headerName]: `${prefix} ${token}` }
export function listCalendars(conn): Promise<CalendarInfo[]>;
export function fetchObjects(conn, calendarUrl, opts: { timeRange?, hrefs?, componentFilter: 'VEVENT' | 'VTODO' }): Promise<{ url, etag, data }[]>;
export function putObject(conn, calendarUrl, filename, ics, etag?): Promise<{ url, etag? }>;   // If-Match when etag given, If-None-Match: * on create
export function deleteObject(conn, objectUrl, etag?): Promise<void>;
export function makeCalendar(conn, props): Promise<void>;
export function freeBusy(conn, calendarUrl | principal, range): Promise<...>; // with client-side fallback
export function smartSync(conn, calendar: CalendarInfo, state: TriggerState): Promise<{ diff-with-objects, nextState }>;
```
HTTP enforcement: reject `http://` unless `allowHttp`. Unit tests limited to pure parts (auth header construction, URL validation); protocol behavior covered by integration tests (Task 13). Commit `feat: add tsdav transport layer`.

### Task 9: Errors

**Files:** Create `shared/errors.ts`, `shared/__tests__/errors.test.ts`

**Produces:** `mapCalDavError(error, ctx: { providerHost?, operation }): NodeApiError | NodeOperationError` implementing PRD §8 hint table (iCloud 401 app-password hint, Google 401 OAuth hint, 412 conflict recovery text, 507/429 retry guidance). Tests assert message content per status/host. Commit `feat: add provider-aware error mapping`.

### Task 10: Credentials

**Files:** Create `credentials/CalDavBasicApi.credentials.ts`, `credentials/CalDavOAuth2Api.credentials.ts`, `credentials/CalDavTokenApi.credentials.ts`, icon `nodes/CalDav/caldav.svg`

Per PRD §5: Basic (serverUrl, username, password[password:true], allowHttp) with `authenticate` generic → `auth`, `test: ICredentialTestRequest` = PROPFIND-capable GET fallback (n8n test requests support method+url; use `PROPFIND` if accepted, else document limitation); OAuth2 `extends ['oAuth2Api']` with Google defaults (authUrl `https://accounts.google.com/o/oauth2/v2/auth`, tokenUrl `https://oauth2.googleapis.com/token`, scope `https://www.googleapis.com/auth/calendar`, `access_type=offline&prompt=consent`); Token (serverUrl, headerName default `Authorization`, tokenPrefix default `Bearer`, token[password:true], allowHttp). Register in package.json `n8n.credentials`. Commit `feat: add Basic, OAuth2, and Token credentials`.

### Task 11: CalDav action node

**Files:** Create `nodes/CalDav/CalDav.node.ts`, `nodes/CalDav/v1/CalDavV1.node.ts`, `nodes/CalDav/v1/actions/{calendar,event,task}/*.ts`, `nodes/CalDav/v1/methods/loadOptions.ts`, `nodes/CalDav/CalDav.node.json`

**Consumes:** everything from Tasks 2-10.
Versioned base (`NodeVersionedType`-style via `defaultVersion: 1`). Resources/operations exactly per PRD §4.2; `usableAsTool: true`; `loadOptions.getCalendars` (all) + `getTaskCalendars` (components includes VTODO); attendee warning text on Create/Update; `continueOnFail` per item; Move = PUT-to-target + DELETE-source. Manual smoke via `n8n-node dev` or linked n8n if feasible. Register in package.json. Commit per resource: `feat: add calendar operations`, `feat: add event operations`, `feat: add task operations`.

### Task 12: CalDavTrigger node

**Files:** Create `nodes/CalDavTrigger/CalDavTrigger.node.ts`

**Consumes:** `smartSync`, `diffEtagMaps`, `expandEvent`, `windowEvents`, parse.
`polling: true`; params: credential, calendar (loadOptions), events multi-select (created/updated/deleted/started/ended), options (expand recurring). `poll()`: load `TriggerState` from `getWorkflowStaticData('node')`; run smartSync; map diff to selected events; for started/ended expand instances over [lastPoll, now] with dedupe; manual mode returns most recent event when no changes. Invalid sync-token → transparent resync without spurious created events (tsdav smartSync handles; verify state reset path). Unit-test the poll pure-composition via extracted `computePollOutput(state, syncResult, selectedEvents, now)` helper in `shared/sync/pollOutput.ts` + tests. Commit `feat: add CalDav polling trigger node`.

### Task 13: Integration harness

**Files:** Create `test/integration/docker-compose.yml` (Radicale + Baikal), `test/integration/radicale.config`, `test/integration/*.test.ts`, npm script `test:integration`

Radicale as primary CI target: full event/task CRUD matrix, ETag conflict (412) path, trigger poll cycle (create → poll → update → poll → delete → poll asserting diff buckets). Skips cleanly when docker unavailable. Commit `test: add dockerized integration harness`.

### Task 14: Docs, lint, release plumbing

**Files:** Modify `README.md` (per-provider setup guides from PRD §6, operation reference, troubleshooting), create `.github/workflows/ci.yml` (lint+build+unit), `.github/workflows/publish.yml` (provenance publish per official starter), `docs/testing.md` (manual provider smoke checklist)

Final gate: `npm run lint` clean, `npm run build` clean, `npx vitest run` all green, placeholder grep clean. Commit `docs: add README provider guides and CI workflows`.

---

## Self-review notes

- PRD §4.2 Get Availability, §4.3 all five trigger events, §5 three credentials, §8 error hints — all mapped to tasks above.
- Type names used across tasks are defined once in Task 2.
- Deferred consciously: npm publish itself (user decision on final package name — PRD §7.4), manual provider smoke runs (need real accounts).

## Verification (end-to-end)

1. `npm run lint && npm run build && npx vitest run` — all clean.
2. `docker compose -f test/integration/docker-compose.yml up -d && npm run test:integration` — CRUD + trigger cycle green against Radicale.
3. Load package into local n8n (`n8n-node dev` or `~/.n8n/custom` link), create workflow: list calendars → create event → update → trigger poll detects it → delete.
