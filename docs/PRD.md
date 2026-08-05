# PRD: n8n-nodes-caldav

**Product:** CalDAV integration package for n8n (action node + trigger node)
**Status:** Draft v1.0 — 2026-08-05
**Repository:** `n8n-nodes-caldav`

Every factual claim in this document carries a source. Items that could not be verified against an authoritative source are explicitly marked **UNVERIFIED** and collected in Appendix C.

---

## 1. Executive summary

n8n has no built-in CalDAV node, and its HTTP Request node cannot issue the `REPORT`/`PROPFIND` methods CalDAV requires. The existing community packages are fragmented (10+ packages, ~5,300 downloads/month combined), and none of them ships a calendar trigger, OAuth2 support, or task (VTODO) support.

This package delivers the definitive CalDAV integration for n8n:

- **CalDAV node** — full CRUD for Calendars, Events (VEVENT), and Tasks (VTODO), plus free/busy queries, against any RFC 4791 server: Apple iCloud, Google Calendar, Nextcloud, Fastmail, Radicale, Baikal, SOGo, Zimbra, Synology, mailbox.org, and generic servers.
- **CalDAV Trigger node** — polling trigger with Event Created / Updated / Deleted / Started / Ended events, using RFC 6578 sync-tokens with ctag and full-fetch fallbacks. No competing package has any calendar trigger; community demand for one dates to 2021 ([forum thread, 17+ votes](https://community.n8n.io/t/caldav-calendar-options/10141)).
- **Auth breadth** — Basic/app-password, OAuth2 (Google), and Bearer/header token credentials. Every competitor is Basic-only.
- **Zero-configuration discovery** — users enter a server URL and credentials; the node performs RFC 6764 discovery (`/.well-known/caldav` → principal → calendar-home-set) and presents calendars in a dropdown. This eliminates the documented iCloud pain of running an external script just to find a calendar URL ([forum evidence](https://community.n8n.io/t/apple-calender-caldav-or-http-req-access/208780)).

**Goals (v1):** become the category-leading CalDAV package by download count (> 2,200/mo, the current leader's volume), with a public repo, tests, and a verified provider matrix.
**Non-goals (v1):** CardDAV contacts, iTIP/iMIP invitations (RSVP), attachments, n8n verified-node status (requires zero runtime dependencies — deferred to v2, see §10).

---

## 2. Market and competitive analysis

Snapshot taken 2026-08-05 from the npm registry (`api.npmjs.org`) and GitHub.

### 2.1 Community packages

| Package | dl/mo | Last publish | Operations | Auth | Trigger | Key gaps |
|---|---|---|---|---|---|---|
| [n8n-nodes-backstack-caldav](https://www.npmjs.com/package/n8n-nodes-backstack-caldav) | 2,162 | 2025-06 | Event get-range/get/create/update | Basic | No | No Delete, no calendar listing; README admits "entirely developed by AI... not reviewed"; GitHub repo 404 — no source, no issues |
| [n8n-nodes-caldav-pro](https://github.com/Daisytwo/n8n-nodes-caldav-pro) | 1,133 | 2026-07 | Calendar get-many; Event full CRUD + move + recurrence + alarms; AI tool | Basic only | No | Self-documented: no OAuth2, no trigger, no VTODO, no free/busy, does not write VTIMEZONE (admits RFC 5545 non-compliance) |
| [n8n-nodes-caldav-calendar](https://github.com/mediabc/n8n-nodes-caldav-calendar) | 582 | 2025-08 | Event get (single date)/create/delete | Basic | No | No Update, single-date queries only; built on unmaintained `dav` lib; issues: trigger request (#2), timezone bugs (#1), all-day events (#11), iCloud connect failure (#10), AI tool crash on empty results (#14) |
| [n8n-nodes-icloud](https://github.com/ozdreamwalk/n8n-nodes-icloud) | 480 | 2026-03 | iCloud-only mail + calendar + contacts | App password | Email only — calendar trigger "not yet implemented" | Single provider |
| [n8n-nodes-icloud-caldav](https://www.npmjs.com/package/n8n-nodes-icloud-caldav) | 366 | 2026-07 | iCloud-first event ops | Basic | No | Narrow scope |
| [n8n-nodes-nextcloud-calendar](https://github.com/terschawebIT/n8n-nodes-nextcloud-calendar) | 294 | 2025-09 | Calendar + event CRUD, Nextcloud invitations | Basic | No | UI in German (#8); invitations silently not sent (#4); timezone problems (#5) |
| [n8n-nodes-dav](https://github.com/x40x1/n8n-nodes-dav) | 109 | 2025-09 | WebDAV/CalDAV/CardDAV basics | Basic | No | Shallow event model |
| [n8n-nodes-caldav](https://www.npmjs.com/package/n8n-nodes-caldav) (that-one-tom) | 36 | 2023-04 | — | — | No | Abandoned; README warns against use; squats the canonical name |

Dead/negligible: `n8n-nodes-caldav-carddav` (100+ bloated runtime deps), `@chrishdx/n8n-nodes-caldav` (fork on dead `dav` lib), `n8n-nodes-caldav2`, archived `n8n-nodes-calcarddav`, raw-request helper `@hblackfox/n8n-nodes-webdav`.

**Reading:** the download leader has no public source and no Delete operation; the feature leader is Basic-auth-only with no trigger and no tasks. Demand exceeds the quality of supply. The category is winnable on trigger + discovery UX + trust signals alone.

### 2.2 Built-in node parity bar

- [Google Calendar node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/): Calendar → Availability (free/busy); Event → Create/Delete/Get/Get Many/Update; AI tool support.
- [Google Calendar Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlecalendartrigger/): polling; events **Created / Updated / Cancelled / Started / Ended**. This is the trigger UX bar this package matches.
- [Microsoft Outlook node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftoutlook/): calendar + event CRUD; its trigger has no calendar events at all.

### 2.3 Community demand (n8n forum)

- [CALDAV calendar options](https://community.n8n.io/t/caldav-calendar-options/10141) (2021→, 17+ votes): asks for native CalDAV nodes and explicitly "how do I trigger if an event starts or ends". Providers named: Nextcloud (dominant), Synology, self-hosted suites.
- [Apple Calendar via CalDAV](https://community.n8n.io/t/apple-calender-caldav-or-http-req-access/208780), [Apple Calendar with CalDAV](https://community.n8n.io/t/apple-calendar-with-caldav/215393): app-specific password confusion; users ran an external Python script to discover the calendar URL ("the biggest trouble"); credential tests that show red while the node actually works.
- [Nextcloud meeting via HTTP Request](https://community.n8n.io/t/adding-a-meeting-to-a-nextcloud-calendar-caldav/60524): users hand-craft raw VCALENDAR bodies with PUT — fragile, write-only, called "very cumbersome".

---

## 3. Personas and use cases

1. **Self-hosting automator (Nextcloud/Radicale/Baikal/Synology).** Wants calendar workflows without handing data to Google. Use cases: create events from form/webhook input, sync between calendars, notify on changes.
2. **iCloud user.** Wants Apple Calendar automation; today needs app-specific-password folklore and manual URL discovery. Use case: "when an event is added to my iCloud calendar, create a task in my project tool."
3. **AI-agent builder.** Exposes the node as an AI Agent tool: "what's on my calendar tomorrow?", "book 30 minutes with X". Needs LLM-friendly operation descriptions and graceful empty-result handling.
4. **Booking/business automation.** Creates ETag-safe events with attendees and alarms from CRM or booking flows; checks free/busy before proposing slots.
5. **Task manager (VTODO).** Manages Nextcloud Tasks / Radicale todo lists from workflows — no competing package offers this.

---

## 4. Product scope

### 4.1 Package layout

One npm package, two nodes (n8n's verification guidelines permit a trigger node alongside the main node for the same service — [verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)):

- `CalDav` — action node, programmatic style. Programmatic is required here: CalDAV is not a JSON REST API (XML bodies, `PROPFIND`/`REPORT` methods), and n8n's [style guide](https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-a-node-building-style/) mandates programmatic for non-REST protocols and for all trigger nodes.
- `CalDavTrigger` — polling trigger node, programmatic style.

Both nodes declare `usableAsTool: true` for AI Agent usage, with LLM-optimized operation descriptions. Empty result sets return an empty item list — never throw (competitor crash: [mediabc #14](https://github.com/mediabc/n8n-nodes-caldav-calendar/issues/14)).

### 4.2 CalDav node — resources and operations

#### Resource: Calendar

| Operation | Behavior |
|---|---|
| Get Many | List calendars from the discovered calendar-home-set with `displayname`, URL, color, `supported-calendar-component-set`, `getctag`, `sync-token`, supported reports |
| Create | `MKCALENDAR` with display name, description, color, component set. Disabled with a clear error for servers that do not support it (Google — [Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)) |
| Delete | `DELETE` on the collection URL, with an explicit "this deletes the calendar and all its contents" confirmation notice in the UI description |
| Get Availability | Busy blocks computed client-side from a time-range event query (recurrences expanded, `TRANSP:TRANSPARENT` events skipped, intervals merged). Client-side is the primary path because it behaves identically on every server; the `free-busy-query` REPORT (RFC 4791 §7.10) is not implemented by all providers (Google lacks it — [Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)) |

All operations that take a calendar use a **dynamic dropdown** (`loadOptions`) populated via discovery, with a "By URL" expression override.

#### Resource: Event (VEVENT)

| Operation | Behavior |
|---|---|
| Create | Build RFC 5545-valid ICS: UID (caller-suppliable, else generated), DTSTART/DTEND or DURATION, all-day (DATE-valued) support, SUMMARY, DESCRIPTION, LOCATION, URL, CATEGORIES, STATUS, TRANSP, RRULE/EXDATE recurrence, ATTENDEEs (email + display name + role/RSVP), ORGANIZER, multiple VALARMs, custom properties. Correct TZID handling with VTIMEZONE emission (see §7.3) — the feature the current leader admits it lacks |
| Get | Fetch by object URL or by UID (`calendar-query` UID filter). Returns parsed JSON plus raw ICS and ETag |
| Get Many | `calendar-query` with time-range filter (coarse server-side pre-filter) + optional text search; client-side recurrence expansion with per-instance output (see §7.3); pagination via limit; option "Expand recurring events" on/off |
| Update | Read-modify-write with **`If-Match: <etag>`** so concurrent modifications fail safely with a clear conflict error and recovery guidance. Preserves UID and unrecognized properties (no silent data loss — model parity between what is read and what is written) |
| Delete | `DELETE` with optional `If-Match` |
| Move | Cross-calendar move: PUT to target + DELETE from source (WebDAV `MOVE` is not portable across providers; Google does not support it — [Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)) |

Recurrence editing: update a single occurrence (writes `RECURRENCE-ID` override component), this-and-future, or the whole series.

#### Resource: Task (VTODO)

| Operation | Behavior |
|---|---|
| Create | SUMMARY, DESCRIPTION, DUE/DTSTART, PRIORITY, STATUS, PERCENT-COMPLETE, CATEGORIES, RELATED-TO (subtasks), RRULE |
| Get / Get Many | `calendar-query` with `VTODO` component filter; filters: status, due range, completed included/excluded |
| Update | ETag-safe, including Complete (STATUS:COMPLETED + COMPLETED + PERCENT-COMPLETE:100) |
| Delete | `DELETE` with optional `If-Match` |

Task operations are **gated per collection, not per provider**: the calendar dropdown for Task operations only offers collections whose `supported-calendar-component-set` includes `VTODO`. Google's CalDAV endpoint has no VTODO support ([Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)); Nextcloud, Radicale, Baikal, SOGo, mailbox.org, and Fastmail store VTODO (see §6).

### 4.3 CalDavTrigger node

Polling trigger following the pattern of n8n's own [Google Calendar Trigger](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Google/Calendar/GoogleCalendarTrigger.node.ts): `description.polling: true`, `async poll(this: IPollFunctions)`, state persisted via `this.getWorkflowStaticData('node')`.

**Trigger events** (parity with Google Calendar Trigger):

| Event | Detection |
|---|---|
| Event Created | New object href appears in sync diff |
| Event Updated | Known href with changed ETag |
| Event Deleted | Href reported removed (sync-collection 404 status or missing from etag set) |
| Event Started | DTSTART (after client-side recurrence expansion) falls within [last poll, now] |
| Event Ended | DTEND/DUE falls within [last poll, now] |

**Change detection strategy**, in fallback order (rationale: [sabre.io client guide](https://sabre.io/dav/building-a-caldav-client/), [RFC 6578](https://www.rfc-editor.org/rfc/rfc6578.html)):

1. **sync-token** — `sync-collection` REPORT returns changed/deleted hrefs + new token directly. Supported by Google (which requires switching to it after initial sync — [Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)) and Nextcloud/sabre-based servers.
2. **ctag + ETag diff** — if no sync-token support: PROPFIND `CS:getctag`; if unchanged, done (cheapest possible poll). If changed, `calendar-query` for ETags only, diff against stored set, `calendar-multiget` only the changed hrefs.
3. **Full resync** — servers with neither mechanism exist (e.g. [Vikunja](https://github.com/go-vikunja/vikunja/issues/2401)); fall back to full fetch + diff.

Invalid/expired sync-tokens (servers may forget them; RFC 6578 mandates client tolerance) trigger automatic full resync without emitting spurious "created" events. Implementation via tsdav `smartCollectionSyncDetailed`, which encapsulates exactly this token-with-ctag-fallback behavior ([tsdav docs](https://tsdav.vercel.app/docs/)).

**State stored** per node in workflow static data: sync-token, ctag, `{href → etag}` map, last poll timestamp, emitted started/ended instance keys (to prevent duplicates). Caveat surfaced in docs: static data is not persisted during manual test runs ([n8n docs](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/)); manual execution returns the most recent events instead, matching Google Calendar Trigger behavior.

### 4.4 Out of scope for v1

CardDAV, iTIP/iMIP scheduling (RSVP/invitations), event attachments, WebDAV push/webhooks, journal entries (VJOURNAL), server-side `expand` reliance. See roadmap (§10).

---

## 5. Credentials and authentication

Three credential types, all implementing `ICredentialType` with declarative injection (`authenticate: IAuthenticateGeneric`) and a working credential test (`test: ICredentialTestRequest` — the node-level `credentialTest` mechanism has open bug reports for community packages: [forum #94069](https://community.n8n.io/t/bug-cant-use-credentialtest-method-in-custom-node/94069)). Secret fields use `typeOptions: { password: true }`.

### 5.1 CalDAV Basic Auth (`calDavBasicApi`)

- Fields: Server URL, Username, Password.
- Covers: iCloud and Fastmail app-specific passwords, Nextcloud app passwords, Radicale/Baikal/SOGo/Zimbra/Synology/mailbox.org accounts.
- Injection: `auth: { username, password }` per [n8n credentials reference](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/credentials-files/).
- Credential test: `PROPFIND Depth: 0` for `current-user-principal` against the server URL — a real authenticated round-trip, fixing the "red credential but node works" complaint.

### 5.2 CalDAV OAuth2 (`calDavOAuth2Api`)

- `extends = ['oAuth2Api']`; n8n core performs the authorization-code flow ([starter example](https://github.com/n8n-io/n8n-nodes-starter/blob/master/credentials/GithubIssuesOAuth2Api.credentials.ts)). Token refresh during execution is handled by tsdav's `Oauth` mode using the stored refresh token — n8n's transparent refresh only applies to its own HTTP helpers, which cannot issue DAV methods (`PROPFIND`/`REPORT`).
- Preconfigured Google defaults (overridable for other OAuth-capable servers): auth URL `https://accounts.google.com/o/oauth2/v2/auth` and token URL `https://oauth2.googleapis.com/token` ([Google OAuth 2.0 for web server apps](https://developers.google.com/identity/protocols/oauth2/web-server)), scope `https://www.googleapis.com/auth/calendar` ([Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)), `access_type=offline&prompt=consent` query parameters for refresh tokens.
- Google requires OAuth2 over HTTPS for CalDAV; Basic auth returns 401 ([Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)).

### 5.3 CalDAV Token Auth (`calDavTokenApi`)

- Fields: Server URL, Header name (default `Authorization`), Token prefix (default `Bearer`), Token.
- Covers: Nextcloud behind OIDC, reverse proxies injecting bearer tokens, API-key-style header schemes.
- tsdav supports Bearer and fully custom auth headers natively ([tsdav auth docs](https://tsdav.vercel.app/docs/)).

### 5.4 Discovery

With only Server URL + credentials, the transport layer performs RFC 6764 discovery: try `/.well-known/caldav` (follow redirects) → `PROPFIND` for `DAV:current-user-principal` → `PROPFIND` for `CALDAV:calendar-home-set` → `PROPFIND Depth: 1` enumerating calendar collections ([RFC 6764](https://www.rfc-editor.org/rfc/rfc6764.html), [sabre.io guide](https://sabre.io/dav/building-a-caldav-client/)). Object URLs and iCalendar UIDs are treated as separate identifiers; URLs are never parsed for meaning (sabre.io guidance). iCloud's per-account partition hosts (`pXX-caldav.icloud.com`) are resolved by this discovery, never hardcoded.

---

## 6. Provider support matrix

| Provider | Endpoint (entry point) | Auth | VTODO | Notes / quirks | Source |
|---|---|---|---|---|---|
| Apple iCloud | `https://caldav.icloud.com` | Basic — Apple ID + 16-char app-specific password (2FA required) | Partial: only reminder lists never "upgraded" since iOS 13 remain visible over CalDAV | Discovery lands on `pXX-caldav.icloud.com/<DSID>/calendars/`; 401 with correct-looking credentials usually means the regular password was used. Apple publishes no official CalDAV docs | [Nylas](https://cli.nylas.com/guides/icloud-caldav-settings), [BusyMac on Reminders](https://www.busymac.com/docs/faqs/112990-reminders-in-ios-13-and-macos-catalina-drops-support-for-caldav/) |
| Google | `https://apidata.googleusercontent.com/caldav/v2/<calendar_id>/events` (primary calendar id = account email) | OAuth2 only | No | No MKCALENDAR, no free-busy-query REPORT, no MOVE; supports ctag + RFC 6578 and requires sync-token mode after initial sync; shares Calendar API quota; legacy `www.google.com/calendar/dav` is dead | [Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide) |
| Nextcloud | `https://<host>/remote.php/dav` | Basic — app password (mandatory with 2FA) | Yes (Tasks app) | sabre/dav server: full sync-token + ctag | [Nextcloud admin docs](https://docs.nextcloud.com/server/stable/admin_manual/groupware/calendar.html) |
| Fastmail | `https://caldav.fastmail.com` | Basic — app password (regular password rejected) | Server-side yes (no Fastmail UI) | Cyrus server; principal fallback URL documented | [Fastmail server names](https://www.fastmail.help/hc/en-us/articles/1500000278342-Server-names-and-ports), [app passwords](https://www.fastmail.help/hc/en-us/articles/360058752854-App-passwords) |
| Radicale | `https://<host>:5232/` | Basic (pluggable) | Yes (+ VJOURNAL) | Reference self-hosted target for integration tests | [radicale.org](https://radicale.org/) |
| Baikal | `https://<host>/dav.php/` | Basic | Yes | sabre/dav-based → sync-token | [Outlook CalDav Synchronizer README](https://github.com/aluxnimm/outlookcaldavsynchronizer/blob/master/README.md) |
| SOGo | `https://<host>/SOGo/dav/` | Basic | Yes | | same as above |
| Zimbra | `https://<host>/dav/<user>/calendar/` | Basic | — | | same as above |
| Synology | `https://<host>:5001/caldav/<user>/` | Basic (NAS account) | — | | same as above |
| mailbox.org | `https://dav.mailbox.org/` | Basic | Yes | | [mailbox.org KB](https://kb.mailbox.org/en/private/addressbook-and-calendar/caldav-and-carddav-for-evolution/), [DAVx5](https://www.davx5.com/tested-with/mailboxorg) |
| Yahoo | — | — | — | **Documented as unsupported**: app-password generation broken since ~09/2023 | [DAVx5](https://www.davx5.com/tested-with/yahoo-mail) |

Per-provider setup guides (app-password creation steps, endpoint, quirks) ship in the README — the trust/documentation gap every competitor leaves open.

---

## 7. Architecture

### 7.1 Technology stack (runtime dependencies)

| Dependency | Role | Why this one |
|---|---|---|
| [tsdav](https://github.com/natelindev/tsdav) (MIT, v2.x) | WebDAV/CalDAV transport: discovery, PROPFIND/REPORT, calendar-query/multiget, MKCALENDAR, smartCollectionSync | TypeScript-native, ~121k weekly downloads, 2 transitive deps (`xml-js`, `debug`), Node ≥ 18; supports Basic/OAuth2 (incl. Google refresh flow)/Bearer/Digest/custom auth; production-proven by [Cal.com's fork](https://github.com/calcom/tsDAV) |
| [ical.js](https://www.npmjs.com/package/ical.js) (MPL-2.0, v2.x) | RFC 5545 parsing **and generation** + `RecurExpansion` for client-side recurrence | Mozilla's reference-grade implementation, zero deps, ~441k weekly downloads. Using one library for both parse and build guarantees round-trip symmetry (in-place component mutation preserves unknown properties) and precise EXDATE/RRULE control. MPL-2.0 is file-level copyleft — safe as an unmodified npm dependency |
| [@touch4it/ical-timezones](https://www.npmjs.com/package/@touch4it/ical-timezones) (ISC, v1.x) | VTIMEZONE component generation for IANA zones (with DST RRULEs) | Zero deps; supplies the VTIMEZONE blocks that ical.js cannot synthesize from zone names |
| [luxon](https://moment.github.io/luxon/) | Timezone math via native `Intl` zone data | n8n's own bundled date library — matches host conventions, no bundled tzdata |

Decision note (implementation): the draft stack listed `ical-generator` for ICS generation; it was replaced by direct ical.js component construction because ical-generator's string-RRULE path cannot carry EXDATE, and single-library parse/build removes a whole class of asymmetry bugs.

Explicitly avoided: the unmaintained `dav` library (source of mediabc's open bugs), standalone `rrule` (known TZID/DST defects; ical.js's `RecurExpansion` covers expansion), and dependency bloat (competitor `n8n-nodes-caldav-carddav` ships 100+ runtime deps).

### 7.2 Module layering (separation of concerns)

```
credentials/
  CalDavBasicApi.credentials.ts
  CalDavOAuth2Api.credentials.ts
  CalDavTokenApi.credentials.ts
nodes/CalDav/
  CalDav.node.ts               # versioned base (NodeVersionedType, defaultVersion)
  v1/
    CalDavV1.node.ts           # description + execute() dispatch only
    actions/                   # one file per resource.operation, single responsibility
      calendar/  event/  task/
    methods/loadOptions.ts     # calendar dropdowns (component-set-aware)
nodes/CalDavTrigger/
  CalDavTrigger.node.ts        # description + poll() dispatch only
shared/
  transport/clientFactory.ts   # credentials -> configured tsdav client (only place auth is handled)
  transport/discovery.ts       # RFC 6764 flow, calendar enumeration
  ical/parse.ts  build.ts      # ICS <-> typed model (round-trip safe, no field loss)
  ical/recurrence.ts           # client-side expansion, RECURRENCE-ID edits
  ical/timezone.ts             # TZID -> IANA resolution, VTIMEZONE emission
  sync/diff.ts                 # sync-token/ctag/etag diffing (pure functions, unit-testable)
  errors.ts                    # provider-aware error mapping
  types.ts                     # typed models shared by node + trigger
```

Rules: the action node and trigger node share all protocol logic through `shared/` — zero duplication; `*.node.ts` files contain UI descriptions and dispatch only; sync diffing is pure-function and fully unit-tested; the parse/build pair guarantees model parity (every property read survives an update round-trip).

### 7.3 Key technical decisions

1. **Client-side recurrence expansion.** Server-side `expand` is inconsistent across servers — the python-caldav project switched to client-side expansion by default for exactly this reason ([docs](https://caldav.readthedocs.io/stable/caldav/calendarobjectresource.html), [issue #157](https://github.com/python-caldav/caldav/issues/157)). Server time-range filtering is used only as a coarse pre-filter; expansion, EXDATE, and RECURRENCE-ID overrides are computed with ical.js.
2. **Timezone correctness.** TZIDs are resolved against IANA zone data via Luxon/`Intl` (RFC 7809 allows servers to omit VTIMEZONE entirely — [RFC 7809](https://www.rfc-editor.org/rfc/rfc7809.html)); embedded VTIMEZONE is parsed via ical.js only for non-IANA custom zones. Generated events include correct VTIMEZONE components — the RFC compliance the market leader lacks.
3. **ETag discipline.** Every read returns the ETag; every write can send `If-Match`. `{url, etag, data}` is the object identity triple; URLs are never interpreted ([sabre.io guide](https://sabre.io/dav/building-a-caldav-client/)).
4. **Versioning from day one.** Full-versioning layout (`v1/` directory, `NodeVersionedType` base with `defaultVersion`) so breaking changes never disrupt existing workflows ([n8n versioning docs](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/versioning)).

### 7.4 Scaffold and toolchain

Scaffolded with the official CLI: `npm create @n8n/node@latest` (`@n8n/node-cli`) — required tooling for community nodes ([n8n docs](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool)). Node.js ≥ 22. TypeScript strict, CommonJS, target es2019, `outDir: dist` ([starter tsconfig](https://github.com/n8n-io/n8n-nodes-starter)). `package.json`: `n8n` block registering credentials/nodes from `dist`, `files: ["dist"]`, `peerDependencies: { "n8n-workflow": "*" }`, name `n8n-nodes-caldav` is squatted by an abandoned package — publish as `@<scope>/n8n-nodes-caldav` or a distinct unscoped name (decision at publish time), keyword `n8n-community-node-package` (required for GUI discovery).

---

## 8. Error handling and security

- All failures throw `NodeApiError`/`NodeOperationError` with provider-aware hints from `shared/errors.ts`: iCloud 401 → "Use an app-specific password from appleid.apple.com, not your Apple ID password"; Google 401 → "Google CalDAV requires OAuth2"; 412 Precondition Failed → "The event changed on the server since it was read — re-fetch and retry"; sync-token 403/410 → transparent resync (no user-facing error).
- `continueOnFail()` honored in the action node; per-item error output with item index.
- Credentials are never logged, never echoed in error messages, and reach the wire only via the transport factory. No filesystem or environment-variable access (also a hard n8n verification rule — [guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)).
- HTTPS enforced by default; a visible opt-in flag allows plain HTTP strictly for LAN/self-hosted servers (Radicale on localhost), with a warning in the field description.
- **Scheduling side-effect caveat, documented in the UI**: on scheduling-aware servers (iCloud, Fastmail), PUTting an event containing ATTENDEE properties can cause the server to email real invitations (RFC 6638 implicit scheduling). The Create/Update UI states this next to the Attendees field.
- Rate behavior: exponential backoff with jitter on 429/5xx; Google CalDAV shares the Calendar API quota ([Google CalDAV guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)).

---

## 9. Quality, testing, and release engineering

**Static quality**

- `n8n-node lint` (`@n8n/eslint-plugin-community-nodes` via `@n8n/node-cli/eslint`) — zero errors.
- `npx @n8n/scan-community-package n8n-nodes-<name>` passes (required for verification, treated as required regardless — [guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)).
- TypeScript strict; no `any`, no `as` casts.

**Tests**

- Unit: ICS parse/build round-trip (property preservation), recurrence expansion (RRULE/EXDATE/RECURRENCE-ID, DST boundaries, all-day), sync diff logic (token, ctag, fallback, invalid-token resync), timezone resolution. Edge cases: empty calendars, events without DTEND, custom X- properties, folded lines, non-IANA TZIDs.
- Integration: docker-compose harness with Radicale, Baikal, and Nextcloud; full operation matrix + trigger poll cycles run in CI against all three.
- Manual provider smoke matrix before each release: iCloud, Google, Fastmail (documented checklist in `docs/testing.md`).
- Local development: `n8n-node dev` (bundled n8n instance with hot reload).

**Release**

- MIT license. English-only UI/docs (n8n requirement).
- README: per-provider setup guides, operation reference, example workflows, troubleshooting.
- Publishing via GitHub Actions with npm provenance — mandatory for all community nodes from 2026-05-01 ([submission docs](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes)); npm Trusted Publishers (OIDC), no long-lived tokens; `release-it` flow from the official starter.
- Conventional commits; semver; CHANGELOG generated on release.

---

## 10. Roadmap

| Version | Content |
|---|---|
| v1.0 | Everything in §4–§9 |
| v1.x | Digest auth if demanded; additional provider guides (Infomaniak, GMX — GMX endpoint currently unverifiable, see Appendix C); performance tuning for very large calendars |
| v2.0 | **Verification track**: n8n verified status requires zero runtime dependencies ([guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)); whether bundling deps into `dist` satisfies this is UNVERIFIED — confirm with n8n before investing. Verified status unlocks n8n Cloud installation |
| v2.x | CardDAV contacts (separate package — one service per package rule), iTIP/iMIP scheduling with explicit send-invitation control, attachments (managed-attachments where supported), VJOURNAL |

---

## 11. Success metrics

1. Downloads: > 2,200/mo within 6 months of launch (overtakes the current category leader).
2. Trigger adoption: trigger node present in ≥ 25% of workflows using the package (n8n has no per-node telemetry for community packages — measured via GitHub issue sampling and forum feedback; directional only).
3. Provider matrix: 100% of documented providers pass the smoke checklist at every release.
4. Quality: zero open crash-class bugs older than 14 days; median issue first-response < 72h.
5. Trust: public repo, tests visible in CI, no unreviewed-AI disclaimers — the trust signals the download leader lacks.

---

## Appendix A — Relevant standards

| Standard | Relevance |
|---|---|
| [RFC 4791](https://www.ietf.org/rfc/rfc4791.txt) — CalDAV | Core protocol: MKCALENDAR, calendar-query, calendar-multiget, free-busy-query |
| [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) — iCalendar | Payload format: VEVENT, VTODO, VTIMEZONE, RRULE |
| [RFC 6578](https://www.rfc-editor.org/rfc/rfc6578.html) — WebDAV sync | sync-token / sync-collection REPORT for efficient polling; clients must tolerate forgotten tokens |
| [RFC 6638](https://www.rfc-editor.org/rfc/rfc6638) — CalDAV scheduling | Implicit scheduling side effects (invitations) — documented caveat only in v1 |
| [RFC 6764](https://www.rfc-editor.org/rfc/rfc6764.html) — Discovery | `/.well-known/caldav`, DNS SRV/TXT |
| [RFC 7809](https://www.rfc-editor.org/rfc/rfc7809.html) — TZ by reference | Servers may omit VTIMEZONE; resolve TZIDs against IANA data |
| [ctag extension](https://github.com/apple/ccs-calendarserver/blob/master/doc/Extensions/caldav-ctag.txt) | Apple CalendarServer extension, de-facto universal cheap change check |

## Appendix B — Primary sources

- n8n: [building-style choice](https://docs.n8n.io/connect/create-nodes/plan-your-node/choose-a-node-building-style/), [credentials reference](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/credentials-files/), [versioning](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/versioning), [verification guidelines](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines), [n8n-node CLI](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool), [official starter](https://github.com/n8n-io/n8n-nodes-starter), [Google Calendar Trigger source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Google/Calendar/GoogleCalendarTrigger.node.ts), [static data](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/)
- Protocol: [sabre.io — building a CalDAV client](https://sabre.io/dav/building-a-caldav-client/), [Google CalDAV API guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)
- Libraries: [tsdav](https://tsdav.vercel.app/docs/), [calcom/tsDAV](https://github.com/calcom/tsDAV), [ical.js](https://www.npmjs.com/package/ical.js), [ical-generator](https://github.com/sebbo2002/ical-generator), [python-caldav expand rationale](https://caldav.readthedocs.io/stable/caldav/calendarobjectresource.html)
- Competitive data: npm registry / `api.npmjs.org` download counts fetched 2026-08-05; package repos linked inline in §2.

## Appendix C — UNVERIFIED items (explicitly flagged)

1. **iCloud and Fastmail sync-collection (RFC 6578) support** — widely field-reported working (DAVx5, vdirsyncer ecosystems) but not officially documented; Apple publishes no CalDAV reference at all. Mitigated by the ctag fallback (§4.3).
2. **Google OAuth scope for CalDAV** — `https://www.googleapis.com/auth/calendar` is documented for the Calendar API; the CalDAV guide page does not restate the scope string. Verify during implementation.
3. **Bundling/vendoring dependencies to satisfy the verified-node "no external dependencies" rule** — n8n docs do not address vendoring; requires confirmation from n8n (v2 decision).
4. **GMX CalDAV endpoint** — no reliable documentation found; not listed in the provider matrix until tested.
5. **`"strict": true` in the package.json `n8n` block** — present in the official starter; exact semantics undocumented.
6. **n8n-nodes-caldav-pro's claimed iCloud/Nextcloud/Synology compatibility** — "expected" per its own README, unverified by its author; treated as untested in §2.
