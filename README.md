# n8n-nodes-caldav

n8n community nodes for CalDAV calendars: full event, task, and calendar management plus a polling trigger, for Apple iCloud, Google Calendar, Nextcloud, Fastmail, Radicale, Baikal, SOGo, Synology, mailbox.org, and any other RFC 4791 server.

## Features

- **CalDAV node** (also usable as an AI Agent tool)
  - Calendar: Get Many, Create, Delete, Get Availability (busy slots)
  - Event: Create, Get, Get Many, Update, Delete, Move between calendars
  - Task (VTODO): Create, Get Many, Update, Complete, Delete
- **CalDAV Trigger node** — starts workflows on Event Created, Updated, Deleted, Started, or Ended, using RFC 6578 sync-tokens with automatic ctag and full-resync fallbacks. No other CalDAV package for n8n offers a calendar trigger.
- Automatic server discovery: enter only the server URL and credentials; calendars appear in a dropdown.
- Safe concurrent editing: updates and deletes use ETag `If-Match`, so changes made elsewhere are never silently overwritten.
- Correct recurrence handling: RRULE expansion is computed client-side (server `expand` support is inconsistent), including EXDATE and per-occurrence overrides, with DST-correct local times and VTIMEZONE components written on create.
- Round-trip safety: updates modify the existing object in place, preserving UID and any properties this node does not model (X- properties and vendor extensions).

## Installation

Self-hosted n8n: **Settings > Community Nodes > Install** and enter `n8n-nodes-caldav`, or:

```bash
npm install n8n-nodes-caldav
```

This package uses runtime dependencies (tsdav, ical.js) and therefore installs on self-hosted n8n instances.

## Credentials

Three credential types are provided. All of them need the **Server URL** — the base URL of the CalDAV server, not a specific calendar. Calendars are discovered automatically.

### CalDAV Basic Auth

For all providers that use username/password or app passwords.

| Provider | Server URL | Username | Password |
|---|---|---|---|
| Apple iCloud | `https://caldav.icloud.com` | Apple ID email | **App-specific password** — generate at [account.apple.com](https://account.apple.com) under Sign-In and Security > App-Specific Passwords. Your normal Apple ID password will not work. |
| Nextcloud | `https://<host>/remote.php/dav` | Nextcloud user | App password (Settings > Security > Devices & sessions) — required when 2FA is enabled |
| Fastmail | `https://caldav.fastmail.com` | Fastmail email | App password (Settings > Privacy & Security > Connected apps) — the account password is rejected |
| Radicale | `https://<host>:5232` | Radicale user | Radicale password |
| Baikal | `https://<host>/dav.php` | Baikal user | Baikal password |
| SOGo | `https://<host>/SOGo/dav` | SOGo user | SOGo password |
| Synology | `https://<host>:5001/caldav/<user>` | NAS account | NAS password |
| mailbox.org | `https://dav.mailbox.org` | mailbox.org email | Account or app password |

Yahoo Calendar is not supported: Yahoo's app-password generation for CalDAV has been broken since 2023.

### CalDAV OAuth2

For Google Calendar (Google rejects passwords on CalDAV; OAuth2 is mandatory):

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (type: Web application) and add the OAuth redirect URL shown by n8n.
2. Enable the **CalDAV API** and add the scope `https://www.googleapis.com/auth/calendar`.
3. The credential defaults are preconfigured for Google (server URL `https://apidata.googleusercontent.com/caldav/v2/`, Google auth and token URLs). Other OAuth2-capable servers work by overriding these fields.

Google CalDAV limitations (documented by Google): no task (VTODO) support, no calendar creation (MKCALENDAR), no cross-calendar Move.

### CalDAV Token

For servers behind OIDC proxies or API-key gateways: configure the header name (default `Authorization`), a value prefix (default `Bearer`), and the token.

## Trigger usage

1. Add **CalDAV Trigger**, pick a credential and a calendar, and select the events to watch: Created, Updated, Deleted, Started, Ended.
2. The first production poll takes a baseline snapshot without emitting events; subsequent polls emit only changes.
3. Started/Ended fire when an event instance's start/end time passes between two polls, including individual occurrences of recurring events; each instance fires once.

Note: n8n does not persist trigger state during manual test runs, so **Test workflow** shows current changes but the baseline is only stored once the workflow is active.

## Behavior notes

- **Invitations**: on scheduling-aware servers (iCloud, Fastmail, Nextcloud), creating or updating an event with attendees can cause the server to email real invitations (RFC 6638 implicit scheduling). The node shows this warning next to the attendee fields.
- **Conflicts**: if an event changed on the server between reading and writing, the update fails with a clear message instead of overwriting; enable "Ignore Conflicts" to force the write.
- **Tasks**: task operations only list calendars whose `supported-calendar-component-set` includes VTODO.
- **HTTP**: plain-HTTP servers are rejected unless the credential explicitly enables "Allow HTTP" (intended for local servers like Radicale on localhost).
- **Availability**: busy slots are computed client-side from events in the range (expanding recurrences, skipping events marked Free), which behaves identically on every server including those without the free-busy REPORT.

## Development

```bash
npm install
npm run build         # compile to dist/
npm test              # unit tests (vitest)
npm run lint          # n8n community-node linter
npm run dev           # local n8n with this node loaded, hot reload
```

Integration tests run against a real Radicale server:

```bash
docker compose -f test/integration/docker-compose.yml up -d
npm run test:integration
```

(Or run Radicale directly: `pip install radicale && python -m radicale --auth-type none --server-hosts localhost:5232`.)

See `docs/PRD.md` for the full product requirements and `docs/testing.md` for the manual provider smoke checklist.

## License

[MIT](LICENSE.md)
